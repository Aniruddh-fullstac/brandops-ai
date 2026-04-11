from __future__ import annotations

"""Campaign Intelligence Graph API."""

import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI

from app.config import Settings, get_settings
from app.graph.builder import build_campaign_graph
from app.schemas.campaign import CampaignArtifacts, CampaignRequest, CampaignResult
from app.services import firebase_client as fb
from app.services.image_store import is_safe_media_filename, is_safe_run_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    Path(settings.media_root).mkdir(parents=True, exist_ok=True)
    app.state.openai = AsyncOpenAI(api_key=settings.openai_api_key)
    app.state.graph = build_campaign_graph(app.state.openai, settings)
    yield
    await app.state.openai.close()


app = FastAPI(title="Campaign Intelligence Graph", lifespan=lifespan)
_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_uid(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:]
    decoded = fb.verify_token(token)
    if decoded:
        return decoded.get("uid")
    return None


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# --- Auth ---
@app.post("/api/auth/verify")
async def auth_verify(request: Request):
    uid = _get_uid(request)
    if not uid:
        return {"authenticated": False}
    return {"authenticated": True, "uid": uid}


# --- Brands ---
@app.get("/api/brands")
async def list_brands(request: Request):
    uid = _get_uid(request)
    if not uid:
        return {"brands": []}
    brands = await fb.list_brands(uid)
    return {"brands": brands}


@app.post("/api/brands")
async def create_brand(request: Request):
    uid = _get_uid(request)
    body = await request.json()
    brand_id = await fb.save_brand(uid or "anonymous", body)
    return {"id": brand_id}


@app.get("/api/brands/{brand_id}")
async def get_brand(brand_id: str):
    brand = await fb.get_brand(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


# --- Campaigns ---
@app.get("/api/campaigns")
async def list_campaigns(request: Request, brand_id: str | None = None):
    uid = _get_uid(request)
    if not uid:
        return {"campaigns": []}
    campaigns = await fb.list_campaigns(brand_id=brand_id, owner_id=uid)
    return {"campaigns": campaigns}


@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: str, request: Request):
    c = await fb.get_campaign(campaign_id)
    if not c:
        raise HTTPException(status_code=404, detail="Campaign not found")
    uid = _get_uid(request)
    owner = c.get("owner_id")
    if owner:
        if not uid or owner != uid:
            raise HTTPException(status_code=404, detail="Campaign not found")
    return c


# --- Admin ---
@app.get("/api/admin/runs")
async def admin_runs():
    runs = await fb.list_all_campaigns(limit=100)
    return {"runs": runs}


# --- Media ---
@app.get("/api/media/runs/{run_id}/{filename}")
async def serve_campaign_media(run_id: str, filename: str):
    settings = get_settings()
    if not is_safe_run_id(run_id) or not is_safe_media_filename(filename):
        raise HTTPException(status_code=404, detail="Not found")
    base = Path(settings.media_root).resolve()
    target = (base / "runs" / run_id / filename).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found") from None
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(target)


# --- SSE Stream ---
def _sse(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


async def stream_campaign(
    req: CampaignRequest,
    graph,
    settings: Settings,
    uid: str | None = None,
) -> AsyncIterator[str]:
    run_id = uuid4().hex
    yield _sse({"event": "run_started", "payload": {"run_id": run_id}})

    campaign_doc_id = await fb.save_campaign({
        "run_id": run_id,
        "owner_id": uid or "anonymous",
        "brand_name": req.brand_name,
        "status": "running",
        "request": req.model_dump(mode="json"),
    })

    initial: dict[str, Any] = {
        "request": req.model_dump(mode="json"),
        "run_id": run_id,
        "trace": [],
        "errors": [],
    }
    last: dict[str, Any] = initial
    trace_len = 0
    sent_keys: set[str] = set()
    try:
        async for packet in graph.astream(
            initial,
            stream_mode=["updates", "values"],
        ):
            if isinstance(packet, tuple) and len(packet) == 2:
                mode, chunk = packet
            else:
                mode, chunk = "values", packet
            if mode == "updates" and isinstance(chunk, dict):
                for node_name, patch in chunk.items():
                    keys = list(patch.keys()) if isinstance(patch, dict) else []
                    yield _sse(
                        {
                            "event": "graph_node_finished",
                            "payload": {"node": str(node_name), "patch_keys": keys},
                        }
                    )
            elif mode == "values" and isinstance(chunk, dict):
                state = chunk
                last = state
                tr = state.get("trace") or []
                if len(tr) > trace_len:
                    for step in tr[trace_len:]:
                        yield _sse({"event": "step_completed", "payload": {"step": step}})
                    trace_len = len(tr)
                for artifact_key in ("strategy", "creatives", "critique", "refined_creatives",
                                     "keyword_graph", "campaign_calendar", "content_schedule",
                                     "audience_segments", "performance_sim", "final_artifacts"):
                    if state.get(artifact_key) and artifact_key not in sent_keys:
                        sent_keys.add(artifact_key)
                        yield _sse(
                            {
                                "event": "artifact_partial",
                                "payload": {"kind": artifact_key, "data": state[artifact_key]},
                            }
                        )

        artifacts_dict = last.get("final_artifacts")
        if not artifacts_dict:
            raise RuntimeError("Run completed without artifacts")
        artifacts = CampaignArtifacts.model_validate(artifacts_dict)
        trace = last.get("trace") or []
        result = CampaignResult(request=req, trace=trace, artifacts=artifacts)
        result_json = result.model_dump(mode="json")

        await fb.update_campaign(campaign_doc_id, {
            "status": "completed",
            "trace": trace,
            "artifacts": result_json.get("artifacts", {}),
        })

        yield _sse(
            {
                "event": "run_completed",
                "payload": {
                    "run_id": run_id,
                    "campaign_id": campaign_doc_id,
                    "result": result_json,
                    "errors": last.get("errors") or [],
                },
            }
        )
    except Exception as exc:  # noqa: BLE001
        await fb.update_campaign(campaign_doc_id, {"status": "failed", "error": str(exc)})
        yield _sse({"event": "run_failed", "payload": {"error": str(exc)}})


@app.post("/api/campaigns/stream")
async def campaigns_stream(req: CampaignRequest, request: Request):
    graph = request.app.state.graph
    settings: Settings = request.app.state.settings
    uid = _get_uid(request)
    return StreamingResponse(
        stream_campaign(req, graph, settings, uid),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/campaigns/run")
async def campaigns_run(req: CampaignRequest, request: Request):
    graph = request.app.state.graph
    run_id = uuid4().hex
    initial: dict[str, Any] = {
        "request": req.model_dump(mode="json"),
        "run_id": run_id,
        "trace": [],
        "errors": [],
    }
    try:
        final = await graph.ainvoke(initial)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    ad = final.get("final_artifacts")
    if not ad:
        raise HTTPException(status_code=500, detail="No artifacts produced")
    artifacts = CampaignArtifacts.model_validate(ad)
    result = CampaignResult(
        request=req,
        trace=final.get("trace") or [],
        artifacts=artifacts,
    )
    return result.model_dump(mode="json")


_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="ui")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

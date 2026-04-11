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
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI

from app.config import Settings, get_settings
from app.graph.builder import build_campaign_graph
from app.schemas.campaign import CampaignArtifacts, CampaignRequest, CampaignResult
from app.schemas.offline import OfflineCampaignCreate, OfflineCampaignPublic, OfflineSubmitResult, OfflineSurveySubmit
from app.services import firebase_client as fb
from app.services.geo_ip import lookup_ip
from app.services.offline_analytics import build_analytics
from app.services.qr_codes import qr_png_bytes
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


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host or ""
    return ""


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


# --- Offline QR campaigns ---
def _offline_public_doc(c: dict) -> OfflineCampaignPublic:
    return OfflineCampaignPublic(
        id=c["id"],
        slug=c["slug"],
        title=c.get("title") or "",
        headline=c.get("headline") or "",
        description=c.get("description") or "",
        brand_name=c.get("brand_name") or "",
        promo_image_urls=list(c.get("promo_image_urls") or []),
        product_options=list(c.get("product_options") or []),
        interest_tags=list(c.get("interest_tags") or []),
        collect_name=bool(c.get("collect_name", True)),
        collect_email=bool(c.get("collect_email", True)),
        collect_phone=bool(c.get("collect_phone", False)),
        collect_age_range=bool(c.get("collect_age_range", True)),
    )


@app.post("/api/offline/campaigns")
async def offline_campaign_create(body: OfflineCampaignCreate, request: Request):
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = body.model_dump(mode="json")
    cid, slug = await fb.save_offline_campaign(uid, payload)
    c = await fb.get_offline_campaign(cid)
    if c is None:
        c = {**payload, "id": cid, "slug": slug, "owner_id": uid}
    settings = get_settings()
    landing = f"{settings.public_app_url.rstrip('/')}/p/{slug}"
    return {"id": cid, "slug": slug, "landing_url": landing, "campaign": c}


@app.get("/api/offline/campaigns")
async def offline_campaign_list(request: Request):
    uid = _get_uid(request)
    if not uid:
        return {"campaigns": []}
    rows = await fb.list_offline_campaigns(uid)
    settings = get_settings()
    base = settings.public_app_url.rstrip("/")
    out = []
    for r in rows:
        slug = r.get("slug") or ""
        out.append({**r, "landing_url": f"{base}/p/{slug}"})
    return {"campaigns": out}


@app.get("/api/offline/campaigns/{campaign_id}")
async def offline_campaign_get(campaign_id: str, request: Request):
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    c = await fb.get_offline_campaign(campaign_id)
    if not c or c.get("owner_id") != uid:
        raise HTTPException(status_code=404, detail="Not found")
    settings = get_settings()
    slug = c.get("slug") or ""
    return {**c, "landing_url": f"{settings.public_app_url.rstrip('/')}/p/{slug}"}


@app.patch("/api/offline/campaigns/{campaign_id}")
async def offline_campaign_patch(campaign_id: str, request: Request):
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    body = await request.json()
    allowed = {"status", "headline", "description", "promo_image_urls", "product_options", "interest_tags",
               "collect_name", "collect_email", "collect_phone", "collect_age_range", "title", "brand_name"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(status_code=400, detail="No valid fields")
    ok = await fb.update_offline_campaign(campaign_id, uid, patch)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    c = await fb.get_offline_campaign(campaign_id)
    settings = get_settings()
    slug = c.get("slug") or ""
    return {**c, "landing_url": f"{settings.public_app_url.rstrip('/')}/p/{slug}"}


@app.get("/api/offline/campaigns/{campaign_id}/analytics")
async def offline_campaign_analytics(campaign_id: str, request: Request):
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    c = await fb.get_offline_campaign(campaign_id)
    if not c or c.get("owner_id") != uid:
        raise HTTPException(status_code=404, detail="Not found")
    responses = await fb.list_offline_responses(campaign_id)
    return {"campaign": {"id": c["id"], "title": c.get("title"), "slug": c.get("slug")}, "analytics": build_analytics(responses)}


@app.get("/api/offline/campaigns/{campaign_id}/qr.png")
async def offline_campaign_qr_png(campaign_id: str, request: Request):
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    c = await fb.get_offline_campaign(campaign_id)
    if not c or c.get("owner_id") != uid:
        raise HTTPException(status_code=404, detail="Not found")
    settings = get_settings()
    slug = c.get("slug") or ""
    url = f"{settings.public_app_url.rstrip('/')}/p/{slug}"
    return Response(content=qr_png_bytes(url), media_type="image/png")


@app.get("/api/offline/campaigns/{campaign_id}/export.csv")
async def offline_campaign_export_csv(campaign_id: str, request: Request):
    uid = _get_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    c = await fb.get_offline_campaign(campaign_id)
    if not c or c.get("owner_id") != uid:
        raise HTTPException(status_code=404, detail="Not found")
    import csv
    import io

    responses = await fb.list_offline_responses(campaign_id, limit=5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "submitted_at",
            "session_id",
            "is_return_visit",
            "country",
            "city",
            "region",
            "location_label",
            "email",
            "name",
            "phone",
            "age_range",
            "rating",
            "products",
            "interests",
            "consent_marketing",
            "user_agent",
        ]
    )
    for r in responses:
        geo = r.get("geo") or {}
        s = r.get("survey") or {}
        w.writerow(
            [
                r.get("submitted_at"),
                r.get("session_id"),
                r.get("is_return_visit"),
                geo.get("country"),
                geo.get("city"),
                geo.get("region"),
                r.get("location_label"),
                s.get("email"),
                s.get("name"),
                s.get("phone"),
                s.get("age_range"),
                s.get("rating"),
                ";".join(s.get("selected_products") or []),
                ";".join(s.get("interests") or []),
                s.get("consent_marketing"),
                r.get("user_agent"),
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="offline-{campaign_id}.csv"'},
    )


@app.get("/api/public/offline/{slug}")
async def public_offline_get(slug: str):
    c = await fb.get_offline_campaign_by_slug(slug)
    if not c or c.get("status") != "active":
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _offline_public_doc(c).model_dump(mode="json")


@app.get("/api/public/offline/{slug}/context")
async def public_offline_context(slug: str, session_id: str | None = None):
    """Return visit detection + aggregate favorites for subtle personalization."""
    from collections import Counter

    c = await fb.get_offline_campaign_by_slug(slug)
    if not c or c.get("status") != "active":
        raise HTTPException(status_code=404, detail="Campaign not found")
    cid = c["id"]
    sid = (session_id or "").strip()
    is_return = False
    if sid:
        prior = await fb.count_prior_sessions(cid, sid)
        is_return = prior > 0
    responses = await fb.list_offline_responses(cid, limit=400)
    pc: Counter[str] = Counter()
    for r in responses:
        for p in (r.get("survey") or {}).get("selected_products") or []:
            pc[str(p)] += 1
    crowd = [n for n, _ in pc.most_common(6)]
    return {"is_return_visitor": is_return, "crowd_favorites": crowd}


@app.post("/api/public/offline/{slug}/submit", response_model=OfflineSubmitResult)
async def public_offline_submit(slug: str, body: OfflineSurveySubmit, request: Request):
    c = await fb.get_offline_campaign_by_slug(slug)
    if not c or c.get("status") != "active":
        raise HTTPException(status_code=404, detail="Campaign not found")
    cid = c["id"]
    session_id = (body.session_id or "").strip() or uuid4().hex
    prior = await fb.count_prior_sessions(cid, session_id)
    is_return = prior > 0
    ip = _client_ip(request)
    geo = await lookup_ip(ip)
    ua = request.headers.get("user-agent") or ""
    survey = {
        "selected_products": body.selected_products,
        "rating": body.rating,
        "interests": body.interests,
        "name": body.name,
        "email": body.email,
        "phone": body.phone,
        "age_range": body.age_range,
        "consent_marketing": body.consent_marketing,
        "consent_analytics": body.consent_analytics,
    }
    await fb.add_offline_response(
        cid,
        session_id,
        is_return,
        ip,
        ua,
        geo,
        body.location_label,
        survey,
    )
    return OfflineSubmitResult(session_id=session_id, is_return_visit=is_return)


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

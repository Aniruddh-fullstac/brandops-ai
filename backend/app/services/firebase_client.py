"""
Firebase Admin SDK — Firestore CRUD and token verification.
Initialisation is lazy: if no credentials are found the module exposes no-op stubs
so the rest of the app still works without Firebase.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

# Per-field / per-RPC size target (Firestore doc max 1MiB; large single writes hit 504 Deadline Exceeded).
_MAX_CHUNK_BYTES = 550_000
_MAX_TRACE_PART_SLOTS = 64
_MAX_ARTIFACT_PART_SLOTS = 32
_CHUNK_PAUSE_S = 0.2

# Campaign list projection — avoids loading multi‑MB `artifacts` / `trace` (Firestore 504 Deadline Exceeded).
_LIST_FIELDS = (
    "brand_name",
    "status",
    "created_at",
    "run_id",
    "owner_id",
    "error",
    "trace_step_count",
    "llm_token_usage",
)


def _firestore_retryable(exc: BaseException) -> bool:
    """gRPC deadline / transient errors while talking to Firestore."""
    try:
        from google.api_core import exceptions as gexc  # type: ignore[import-not-found]

        if isinstance(exc, (gexc.DeadlineExceeded, gexc.ServiceUnavailable, gexc.Aborted)):
            return True
    except Exception:
        pass
    msg = str(exc).lower()
    return "deadline" in msg or "504" in msg or "unavailable" in msg or "timeout" in msg


def _json_bytes(obj: Any) -> int:
    return len(json.dumps(obj, default=str).encode("utf-8"))


def _redact_inline_base64_images(obj: Any) -> Any:
    """
    Replace data:image/* base64 payloads with a short placeholder so Firestore docs stay under 1 MiB.
    Binary files remain on disk; API serves them via /api/media/runs/...
    """
    if obj is None:
        return None
    if isinstance(obj, str):
        if len(obj) > 200 and obj.startswith("data:image"):
            return "[local image — omitted from cloud sync]"
        return obj
    if isinstance(obj, list):
        return [_redact_inline_base64_images(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _redact_inline_base64_images(v) for k, v in obj.items()}
    return obj


def _split_list_by_json_budget(items: list[Any], max_bytes: int) -> list[list[Any]]:
    """Split a list so each part’s JSON is ≤ max_bytes (best-effort)."""
    if not items:
        return []
    parts: list[list[Any]] = []
    chunk: list[Any] = []
    for item in items:
        chunk.append(item)
        if _json_bytes(chunk) > max_bytes:
            if len(chunk) == 1:
                parts.append(chunk)
                chunk = []
            else:
                parts.append(chunk[:-1])
                chunk = [item]
    if chunk:
        parts.append(chunk)
    return parts


def _merge_chunked_campaign_fields(doc: dict[str, Any]) -> None:
    """Merge trace_part_* / artifacts_part_* into trace / artifacts."""
    tc = doc.get("trace_part_count") or 0
    if isinstance(tc, int) and tc > 0:
        merged: list[Any] = []
        for i in range(tc):
            part = doc.get(f"trace_part_{i}")
            if isinstance(part, list):
                merged.extend(part)
        if merged:
            doc["trace"] = merged
        doc.pop("trace_part_count", None)
        for i in range(_MAX_TRACE_PART_SLOTS):
            doc.pop(f"trace_part_{i}", None)

    ac = doc.get("artifacts_part_count") or 0
    if isinstance(ac, int) and ac > 0:
        merged_a: dict[str, Any] = {}
        for i in range(ac):
            part = doc.get(f"artifacts_part_{i}")
            if isinstance(part, dict):
                merged_a.update(part)
        if merged_a:
            doc["artifacts"] = merged_a
        doc.pop("artifacts_part_count", None)
        for i in range(_MAX_ARTIFACT_PART_SLOTS):
            doc.pop(f"artifacts_part_{i}", None)


def _sync_update_campaign_chunked(campaign_id: str, data: dict[str, Any]) -> None:
    """
    Write campaign updates in smaller Firestore commits to avoid 504 / deadline errors.
    Order: metadata → trace (possibly multi-part) → artifacts (possibly multi-part).
    """
    from google.cloud.firestore import DELETE_FIELD

    db = get_db()
    if db is None:
        return
    ref = db.collection("campaigns").document(campaign_id)
    payload = dict(data)
    trace = payload.pop("trace", None)
    artifacts = payload.pop("artifacts", None)
    if trace is not None:
        trace = _redact_inline_base64_images(trace)
    if artifacts is not None:
        artifacts = _redact_inline_base64_images(artifacts)

    def pause() -> None:
        time.sleep(_CHUNK_PAUSE_S)

    if payload:
        ref.update(payload)
        pause()

    if trace is not None:
        if not trace:
            u: dict[str, Any] = {"trace": [], "trace_part_count": 0}
            for i in range(_MAX_TRACE_PART_SLOTS):
                u[f"trace_part_{i}"] = DELETE_FIELD
            ref.update(u)
            pause()
        elif _json_bytes(trace) <= _MAX_CHUNK_BYTES:
            u = {"trace": trace, "trace_part_count": 0}
            for i in range(_MAX_TRACE_PART_SLOTS):
                u[f"trace_part_{i}"] = DELETE_FIELD
            ref.update(u)
            pause()
        else:
            parts = _split_list_by_json_budget(trace, _MAX_CHUNK_BYTES)
            head: dict[str, Any] = {
                "trace": DELETE_FIELD,
                "trace_part_count": len(parts),
                "trace_part_0": parts[0],
            }
            for i in range(1, _MAX_TRACE_PART_SLOTS):
                head[f"trace_part_{i}"] = DELETE_FIELD
            ref.update(head)
            pause()
            for i in range(1, len(parts)):
                ref.update({f"trace_part_{i}": parts[i]})
                pause()

    if artifacts is not None:
        if _json_bytes(artifacts) <= _MAX_CHUNK_BYTES:
            u = {"artifacts": artifacts, "artifacts_part_count": 0}
            for i in range(_MAX_ARTIFACT_PART_SLOTS):
                u[f"artifacts_part_{i}"] = DELETE_FIELD
            ref.update(u)
        else:
            keys = list(artifacts.keys())
            chunks: list[dict[str, Any]] = []
            cur: dict[str, Any] = {}
            for k in keys:
                trial = {**cur, k: artifacts[k]}
                if cur and _json_bytes(trial) > _MAX_CHUNK_BYTES:
                    chunks.append(cur)
                    cur = {k: artifacts[k]}
                else:
                    cur = trial
            if cur:
                chunks.append(cur)
            head_a: dict[str, Any] = {
                "artifacts": DELETE_FIELD,
                "artifacts_part_count": len(chunks),
                "artifacts_part_0": chunks[0],
            }
            for i in range(1, _MAX_ARTIFACT_PART_SLOTS):
                head_a[f"artifacts_part_{i}"] = DELETE_FIELD
            ref.update(head_a)
            pause()
            for i in range(1, len(chunks)):
                ref.update({f"artifacts_part_{i}": chunks[i]})
                pause()


async def _run_sync_retry(callable_fn, *args: Any, retries: int = 3, **kwargs: Any) -> Any:
    last: BaseException | None = None
    for attempt in range(retries):
        try:
            return await asyncio.to_thread(callable_fn, *args, **kwargs)
        except Exception as exc:
            last = exc
            if attempt < retries - 1 and _firestore_retryable(exc):
                await asyncio.sleep(1.0 * (attempt + 1))
                logger.warning(
                    "Firestore transient error (attempt %s/%s): %s",
                    attempt + 1,
                    retries,
                    exc,
                )
                continue
            raise
    assert last is not None
    raise last

_db = None
_auth_mod = None
_initialised = False


def _init_firebase() -> None:
    global _db, _auth_mod, _initialised
    if _initialised:
        return
    _initialised = True
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, auth

        sa_path = Path(__file__).resolve().parent.parent.parent / "firebase-sa.json"
        if sa_path.exists():
            cred = credentials.Certificate(str(sa_path))
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
        _db = firestore.client()
        _auth_mod = auth
        logger.info("Firebase Admin initialised.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Firebase unavailable: %s — persistence disabled.", exc)


def get_db():
    _init_firebase()
    return _db


def get_auth():
    _init_firebase()
    return _auth_mod


def verify_token(id_token: str) -> dict[str, Any] | None:
    auth = get_auth()
    if auth is None:
        return None
    try:
        return auth.verify_id_token(id_token)
    except Exception:  # noqa: BLE001
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sync_save_brand(uid: str, data: dict[str, Any]) -> str:
    db = get_db()
    if db is None:
        return "local"
    doc_ref = db.collection("brands").document()
    doc_ref.set({**data, "owner_id": uid, "created_at": _now_iso()})
    return doc_ref.id


async def save_brand(uid: str, data: dict[str, Any]) -> str:
    return await _run_sync_retry(_sync_save_brand, uid, data)


async def list_brands(uid: str) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    docs = db.collection("brands").where("owner_id", "==", uid).stream()
    return [{**d.to_dict(), "id": d.id} for d in docs]


async def get_brand(brand_id: str) -> dict[str, Any] | None:
    db = get_db()
    if db is None:
        return None
    doc = db.collection("brands").document(brand_id).get()
    if doc.exists:
        return {**doc.to_dict(), "id": doc.id}
    return None


def _sync_save_campaign(data: dict[str, Any]) -> str:
    db = get_db()
    if db is None:
        return "local"
    doc_ref = db.collection("campaigns").document()
    doc_ref.set({**data, "created_at": _now_iso()})
    return doc_ref.id


async def save_campaign(data: dict[str, Any]) -> str:
    return await _run_sync_retry(_sync_save_campaign, data)


def _sync_update_campaign(campaign_id: str, data: dict[str, Any]) -> None:
    db = get_db()
    if db is None:
        return
    payload = dict(data)
    if "trace" in payload:
        payload["trace"] = _redact_inline_base64_images(payload["trace"])
    if "artifacts" in payload:
        payload["artifacts"] = _redact_inline_base64_images(payload["artifacts"])
    db.collection("campaigns").document(campaign_id).update(payload)


async def update_campaign(campaign_id: str, data: dict[str, Any]) -> None:
    has_large = _json_bytes(data) > _MAX_CHUNK_BYTES or "trace" in data or "artifacts" in data
    if has_large:
        await _run_sync_retry(_sync_update_campaign_chunked, campaign_id, data, retries=5)
    else:
        await _run_sync_retry(_sync_update_campaign, campaign_id, data)


def _sync_get_campaign(campaign_id: str) -> dict[str, Any] | None:
    db = get_db()
    if db is None:
        return None
    doc = db.collection("campaigns").document(campaign_id).get()
    if doc.exists:
        d = {**doc.to_dict(), "id": doc.id}
        _merge_chunked_campaign_fields(d)
        return d
    return None


async def get_campaign(campaign_id: str) -> dict[str, Any] | None:
    return await _run_sync_retry(_sync_get_campaign, campaign_id)


def _sync_list_campaigns(
    brand_id: str | None,
    owner_id: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    from google.cloud.firestore import Query

    db = get_db()
    if db is None:
        return []
    ref = db.collection("campaigns")
    if brand_id:
        ref = ref.where("brand_id", "==", brand_id)
    # Fetch extra rows when filtering by owner in Python (avoids composite index requirement).
    fetch_limit = max(limit * 4, 80) if owner_id else limit
    # google-cloud-firestore: select(field_paths) takes one iterable, not *fields
    q = ref.order_by("created_at", direction=Query.DESCENDING).select(_LIST_FIELDS).limit(fetch_limit)
    rows = [{**d.to_dict(), "id": d.id} for d in q.stream()]
    if owner_id:
        rows = [r for r in rows if r.get("owner_id") == owner_id][:limit]
    else:
        rows = rows[:limit]
    return rows


async def list_campaigns(
    brand_id: str | None = None,
    owner_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    return await _run_sync_retry(_sync_list_campaigns, brand_id, owner_id, limit)


def _sync_list_all_campaigns(limit: int) -> list[dict[str, Any]]:
    from google.cloud.firestore import Query

    db = get_db()
    if db is None:
        return []
    docs = (
        db.collection("campaigns")
        .order_by("created_at", direction=Query.DESCENDING)
        .select(_LIST_FIELDS)
        .limit(limit)
        .stream()
    )
    return [{**d.to_dict(), "id": d.id} for d in docs]


async def list_all_campaigns(limit: int = 100) -> list[dict[str, Any]]:
    return await _run_sync_retry(_sync_list_all_campaigns, limit)


# --- Offline QR campaigns ---


def _offline_slug_unique(base: str) -> str:
    return f"{base}-{uuid4().hex[:6]}"


async def save_offline_campaign(owner_id: str, data: dict[str, Any]) -> tuple[str, str]:
    """Returns (doc_id, slug)."""
    db = get_db()
    title = (data.get("title") or "campaign").strip()
    from app.schemas.offline import slugify

    base_slug = slugify(title)
    slug = _offline_slug_unique(base_slug)
    payload = {
        **data,
        "owner_id": owner_id,
        "slug": slug,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if db is None:
        return "local", slug
    doc_ref = db.collection("offline_campaigns").document()
    doc_ref.set(payload)
    return doc_ref.id, slug


async def update_offline_campaign(campaign_id: str, owner_id: str, data: dict[str, Any]) -> bool:
    db = get_db()
    if db is None:
        return False
    doc = db.collection("offline_campaigns").document(campaign_id).get()
    if not doc.exists or doc.to_dict().get("owner_id") != owner_id:
        return False
    db.collection("offline_campaigns").document(campaign_id).update({**data, "updated_at": _now_iso()})
    return True


async def get_offline_campaign(campaign_id: str) -> dict[str, Any] | None:
    db = get_db()
    if db is None:
        return None
    doc = db.collection("offline_campaigns").document(campaign_id).get()
    if doc.exists:
        return {**doc.to_dict(), "id": doc.id}
    return None


async def get_offline_campaign_by_slug(slug: str) -> dict[str, Any] | None:
    db = get_db()
    if db is None:
        return None
    docs = db.collection("offline_campaigns").where("slug", "==", slug).limit(1).stream()
    for d in docs:
        return {**d.to_dict(), "id": d.id}
    return None


async def list_offline_campaigns(owner_id: str, limit: int = 50) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    docs = (
        db.collection("offline_campaigns")
        .where("owner_id", "==", owner_id)
        .limit(limit * 2)
        .stream()
    )
    rows = [{**d.to_dict(), "id": d.id} for d in docs]
    rows.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return rows[:limit]


async def count_prior_sessions(campaign_id: str, session_id: str) -> int:
    db = get_db()
    if db is None or not session_id:
        return 0
    ref = (
        db.collection("offline_campaigns")
        .document(campaign_id)
        .collection("responses")
        .where("session_id", "==", session_id)
    )
    return sum(1 for _ in ref.limit(5).stream())


async def add_offline_response(
    campaign_id: str,
    session_id: str,
    is_return_visit: bool,
    ip: str,
    user_agent: str,
    geo: dict[str, Any],
    location_label: str | None,
    survey: dict[str, Any],
) -> str:
    db = get_db()
    payload = {
        "session_id": session_id,
        "is_return_visit": is_return_visit,
        "ip": ip,
        "user_agent": user_agent[:500] if user_agent else "",
        "geo": geo,
        "location_label": location_label or "",
        "survey": survey,
        "submitted_at": _now_iso(),
    }
    if db is None:
        return "local"
    doc_ref = (
        db.collection("offline_campaigns")
        .document(campaign_id)
        .collection("responses")
        .document()
    )
    doc_ref.set(payload)
    return doc_ref.id


async def list_offline_responses(campaign_id: str, limit: int = 5000) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    ref = db.collection("offline_campaigns").document(campaign_id).collection("responses")
    try:
        docs = ref.order_by("submitted_at", direction="DESCENDING").limit(limit).stream()
    except Exception:  # noqa: BLE001
        docs = ref.limit(limit).stream()
    return [{**d.to_dict(), "id": d.id} for d in docs]


async def add_offline_event(
    campaign_id: str,
    session_id: str,
    event_type: str,
    location_label: str | None,
    ip: str,
    user_agent: str,
    geo: dict[str, Any],
    meta: dict[str, Any],
) -> str:
    db = get_db()
    payload = {
        "session_id": session_id,
        "event_type": event_type,
        "location_label": location_label or "",
        "ip": ip,
        "user_agent": user_agent[:500] if user_agent else "",
        "geo": geo,
        "meta": meta or {},
        "created_at": _now_iso(),
    }
    if db is None:
        return "local"
    doc_ref = (
        db.collection("offline_campaigns")
        .document(campaign_id)
        .collection("events")
        .document()
    )
    doc_ref.set(payload)
    return doc_ref.id


async def list_offline_events(campaign_id: str, limit: int = 15000) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    ref = db.collection("offline_campaigns").document(campaign_id).collection("events")
    try:
        docs = ref.order_by("created_at", direction="DESCENDING").limit(limit).stream()
    except Exception:  # noqa: BLE001
        docs = ref.limit(limit).stream()
    return [{**d.to_dict(), "id": d.id} for d in docs]

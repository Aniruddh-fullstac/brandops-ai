"""
Firebase Admin SDK — Firestore CRUD and token verification.
Initialisation is lazy: if no credentials are found the module exposes no-op stubs
so the rest of the app still works without Firebase.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

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


async def save_brand(uid: str, data: dict[str, Any]) -> str:
    db = get_db()
    if db is None:
        return "local"
    doc_ref = db.collection("brands").document()
    doc_ref.set({**data, "owner_id": uid, "created_at": _now_iso()})
    return doc_ref.id


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


async def save_campaign(data: dict[str, Any]) -> str:
    db = get_db()
    if db is None:
        return "local"
    doc_ref = db.collection("campaigns").document()
    doc_ref.set({**data, "created_at": _now_iso()})
    return doc_ref.id


async def update_campaign(campaign_id: str, data: dict[str, Any]) -> None:
    db = get_db()
    if db is None:
        return
    db.collection("campaigns").document(campaign_id).update(data)


async def get_campaign(campaign_id: str) -> dict[str, Any] | None:
    db = get_db()
    if db is None:
        return None
    doc = db.collection("campaigns").document(campaign_id).get()
    if doc.exists:
        return {**doc.to_dict(), "id": doc.id}
    return None


async def list_campaigns(
    brand_id: str | None = None,
    owner_id: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    ref = db.collection("campaigns")
    if brand_id:
        ref = ref.where("brand_id", "==", brand_id)
    # Fetch extra rows when filtering by owner in Python (avoids composite index requirement).
    fetch_limit = max(limit * 4, 80) if owner_id else limit
    docs = ref.order_by("created_at", direction="DESCENDING").limit(fetch_limit).stream()
    rows = [{**d.to_dict(), "id": d.id} for d in docs]
    if owner_id:
        rows = [r for r in rows if r.get("owner_id") == owner_id][:limit]
    else:
        rows = rows[:limit]
    return rows


async def list_all_campaigns(limit: int = 100) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    docs = db.collection("campaigns").order_by("created_at", direction="DESCENDING").limit(limit).stream()
    return [{**d.to_dict(), "id": d.id} for d in docs]


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


async def list_offline_responses(campaign_id: str, limit: int = 800) -> list[dict[str, Any]]:
    db = get_db()
    if db is None:
        return []
    ref = db.collection("offline_campaigns").document(campaign_id).collection("responses")
    try:
        docs = ref.order_by("submitted_at", direction="DESCENDING").limit(limit).stream()
    except Exception:  # noqa: BLE001
        docs = ref.limit(limit).stream()
    return [{**d.to_dict(), "id": d.id} for d in docs]

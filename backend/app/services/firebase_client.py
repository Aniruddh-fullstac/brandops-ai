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

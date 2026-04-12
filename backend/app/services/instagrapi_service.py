"""
instagrapi_service.py — Instagram metrics via unofficial mobile-API client.

Provides three public helpers (all sync; wrap with asyncio.to_thread for async use):

  get_handle_stats(handle, max_posts)
      Profile + per-post metrics (likes, comments, views/plays).

  get_post_comments(media_id, max_comments)
      Raw comment text for a single post.

  get_trending_posts_with_comments(handle, max_posts, top_n, max_comments, threshold)
      Top posts ranked by engagement with their actual comment text attached.

Session is cached to INSTAGRAPI_SESSION_FILE so re-logins are minimal.
If password login fails, set INSTAGRAPI_SESSION_ID (browser sessionid cookie) in .env.
"""

from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def _log_handle_stats_failure(handle: str, exc: BaseException) -> None:
    """Instagram often returns long challenge/blacklist text; avoid spamming ERROR for expected blocks."""
    msg = str(exc).lower()
    short = str(exc)
    if len(short) > 220:
        short = short[:217] + "..."
    if any(
        x in msg
        for x in (
            "blacklist",
            "facebook account",
            "challenge_required",
            "login_required",
            "please wait",
            "rate limit",
        )
    ):
        logger.warning(
            "get_handle_stats(%s): Instagram blocked or challenged this session/IP (%s)",
            handle,
            short,
        )
    else:
        logger.error("get_handle_stats(%s): %s", handle, exc)


# ---------------------------------------------------------------------------
# Lazy singleton client — one login per process
# ---------------------------------------------------------------------------

_client = None


def _redact_proxy_url(dsn: str | None) -> str:
    if not dsn:
        return "direct"
    try:
        u = urlparse(dsn)
        if u.username:
            port = f":{u.port}" if u.port else ""
            host = u.hostname or ""
            return f"{u.scheme}://{u.username}:***@{host}{port}"
        return dsn
    except Exception:
        return "<proxy>"


def _new_instagrapi_client(proxy_dsn: str | None):
    from instagrapi import Client

    cl = Client()
    cl.delay_range = [1, 3]
    if proxy_dsn:
        cl.set_proxy(proxy_dsn)
    return cl


def _attempt_login(
    proxy: str | None,
    username: str,
    password: str,
    session_path: Path,
    session_id: str | None = None,
):
    """
    Login order:
    1. Cached session file + username/password (refresh cookies).
    2. INSTAGRAPI_SESSION_ID — browser `sessionid` cookie (bypasses many BadPassword blocks).
    3. Fresh username/password login.
    """
    def fresh() -> Any:
        return _new_instagrapi_client(proxy)

    sid = (session_id or "").strip()

    cl = fresh()
    if session_path.is_file() and username and password:
        try:
            cl.load_settings(session_path)
            cl.login(username, password)
            logger.info("instagrapi: session loaded from %s", session_path)
            return cl
        except Exception as exc:
            logger.warning("instagrapi: cached session invalid (%s) — trying other methods", exc)
            cl = fresh()

    if sid:
        try:
            cl = fresh()
            cl.login_by_sessionid(sid)
            session_path.parent.mkdir(parents=True, exist_ok=True)
            cl.dump_settings(session_path)
            logger.info(
                "instagrapi: logged in via INSTAGRAPI_SESSION_ID; session saved to %s",
                session_path,
            )
            return cl
        except Exception as exc:
            logger.warning("instagrapi: login_by_sessionid failed (%s) — trying password", exc)
            cl = fresh()

    if not username or not password:
        raise ValueError(
            "Set INSTAGRAPI_USERNAME and INSTAGRAPI_PASSWORD in .env, "
            "or set INSTAGRAPI_SESSION_ID to the `sessionid` cookie from instagram.com (while logged in in the browser)."
        )

    cl.login(username, password)
    session_path.parent.mkdir(parents=True, exist_ok=True)
    cl.dump_settings(session_path)
    logger.info(
        "instagrapi: fresh login as %s; session saved to %s",
        username,
        session_path,
    )
    return cl


def _get_client():
    """Return a logged-in instagrapi Client, loading or creating a session."""
    global _client
    if _client is not None:
        return _client

    try:
        from instagrapi import Client  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "instagrapi is not installed. Run: pip install instagrapi"
        ) from exc

    from app.config import get_settings

    s = get_settings()
    username = s.instagrapi_username
    password = s.instagrapi_password
    session_path = Path(s.instagrapi_session_file)
    session_id = (s.instagrapi_session_id or "").strip() or None

    if not session_id and (not username or not password):
        raise ValueError(
            "Set INSTAGRAPI_USERNAME and INSTAGRAPI_PASSWORD in .env, "
            "or set INSTAGRAPI_SESSION_ID (browser sessionid cookie) to enable Instagram lookup."
        )

    proxies = list(s.instagrapi_proxy_list)
    if not proxies:
        proxies = [None]

    random.shuffle(proxies)
    last_exc: BaseException | None = None
    for proxy in proxies:
        try:
            cl = _attempt_login(proxy, username, password, session_path, session_id=session_id)
            _client = cl
            logger.info("instagrapi: using %s", _redact_proxy_url(proxy))
            return _client
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "instagrapi: login failed via %s: %s",
                _redact_proxy_url(proxy),
                exc,
            )
    assert last_exc is not None
    raise last_exc


def clear_instagrapi_client() -> None:
    """Clear cached client (e.g. after changing INSTAGRAPI_PROXIES). Prefer restarting the process."""
    global _client
    _client = None


def get_instagrapi_client():
    """Return the shared logged-in instagrapi Client."""
    return _get_client()


# ---------------------------------------------------------------------------
# Public helpers (synchronous — run in executor for async contexts)
# ---------------------------------------------------------------------------

def get_handle_stats(
    handle: str,
    max_posts: int = 20,
) -> dict[str, Any]:
    """
    Fetch profile info and per-post engagement metrics.

    Returns:
        {
          handle, followers, following, bio, posts_fetched,
          total_likes, average_likes, total_video_views,
          posts: [{id, shortcode, media_type, like_count, comment_count,
                   video_view_count, play_count, permalink, timestamp, caption}],
          error
        }
    """
    handle = handle.lstrip("@").strip()
    result: dict[str, Any] = {
        "handle": handle,
        "followers": None,
        "following": None,
        "bio": None,
        "posts_fetched": 0,
        "total_likes": 0,
        "average_likes": 0.0,
        "total_video_views": 0,
        "posts": [],
        "error": None,
    }

    try:
        cl = _get_client()
        # Private mobile API only — skip public www/GraphQL first (rate limits + log spam).
        info = cl.user_info_by_username_v1(handle)
        user_id = str(info.pk)

        result["followers"] = info.follower_count
        result["following"] = info.following_count
        result["bio"] = info.biography or ""

        medias = cl.user_medias_v1(user_id, amount=max_posts)

        posts: list[dict[str, Any]] = []
        total_likes = 0
        total_views = 0

        _type_map = {1: "Photo", 2: "Video", 8: "Album"}

        for m in medias:
            likes = m.like_count or 0
            comments = m.comment_count or 0
            play_count = getattr(m, "play_count", None)
            view_count = getattr(m, "view_count", None)
            views = play_count or view_count or 0

            total_likes += likes
            total_views += views

            posts.append(
                {
                    "id": str(m.id),
                    "shortcode": m.code,
                    "media_type": _type_map.get(m.media_type, str(m.media_type)),
                    "like_count": likes,
                    "comment_count": comments,
                    "engagement": likes + comments,
                    "video_view_count": view_count,
                    "play_count": play_count,
                    "permalink": f"https://www.instagram.com/p/{m.code}/",
                    "timestamp": m.taken_at.isoformat() if m.taken_at else None,
                    "caption": (m.caption_text or "")[:600],
                }
            )

        result["posts"] = posts
        result["posts_fetched"] = len(posts)
        result["total_likes"] = total_likes
        result["total_video_views"] = total_views
        if posts:
            result["average_likes"] = round(total_likes / len(posts), 2)

    except Exception as exc:
        result["error"] = str(exc)
        _log_handle_stats_failure(handle, exc)

    return result


def get_post_comments(
    media_id: str,
    max_comments: int = 50,
) -> list[dict[str, Any]]:
    """
    Fetch comments for a single post.

    Returns list of {text, like_count, username}.
    """
    try:
        cl = _get_client()
        raw = cl.media_comments(media_id, amount=max_comments)
        return [
            {
                "text": c.text or "",
                "like_count": c.like_count or 0,
                "username": c.user.username if c.user else None,
            }
            for c in raw
        ]
    except Exception as exc:
        logger.warning("get_post_comments(%s): %s", media_id, exc)
        return []


def get_trending_posts_with_comments(
    handle: str,
    max_posts: int = 20,
    top_n: int = 5,
    max_comments: int = 30,
    engagement_threshold: int = 50,
) -> dict[str, Any]:
    """
    Combined call: fetch posts, rank by engagement, pull comments for top posts.

    Only posts with (likes + comments) >= engagement_threshold get comment fetching.

    Returns:
        {
          handle, followers, following, bio, posts_fetched, average_likes,
          total_video_views, all_posts, top_posts_with_comments, error
        }
    """
    stats = get_handle_stats(handle, max_posts=max_posts)

    posts = stats.get("posts") or []
    ranked = sorted(posts, key=lambda p: p.get("engagement", 0), reverse=True)

    top_posts: list[dict[str, Any]] = []
    for post in ranked[:top_n]:
        if post.get("engagement", 0) < engagement_threshold:
            top_posts.append({**post, "comments_text": []})
            continue
        comments = get_post_comments(post["id"], max_comments=max_comments)
        top_posts.append({**post, "comments_text": comments})

    return {
        "handle": stats["handle"],
        "followers": stats["followers"],
        "following": stats["following"],
        "bio": stats["bio"],
        "posts_fetched": stats["posts_fetched"],
        "average_likes": stats["average_likes"],
        "total_video_views": stats["total_video_views"],
        "all_posts": ranked,
        "top_posts_with_comments": top_posts,
        "error": stats.get("error"),
    }

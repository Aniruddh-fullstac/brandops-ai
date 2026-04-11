from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from pathlib import Path
from typing import Any

from app.services.instagrapi_service import get_instagrapi_client

logger = logging.getLogger(__name__)


def get_account_stats(handle: str, max_posts: int = 20) -> dict[str, Any]:
    handle = handle.lstrip("@").strip()
    if not handle:
        raise ValueError("handle is required")

    cl = get_instagrapi_client()
    user_id = cl.user_id_from_username(handle)
    user = cl.user_info(user_id)
    medias = cl.user_medias(user_id, amount=max_posts)

    posts = []
    total_likes = 0
    total_comments = 0
    total_views = 0

    for m in medias:
        likes = m.like_count or 0
        comments = m.comment_count or 0
        views = getattr(m, "play_count", None) or getattr(m, "view_count", None) or 0

        total_likes += likes
        total_comments += comments
        total_views += views

        posts.append({
            "media_id": str(m.id),
            "shortcode": m.code,
            "permalink": f"https://www.instagram.com/p/{m.code}/",
            "media_type": m.media_type,
            "product_type": getattr(m, "product_type", None),
            "taken_at": m.taken_at.isoformat() if m.taken_at else None,
            "caption": m.caption_text or "",
            "like_count": likes,
            "comment_count": comments,
            "view_count": views,
        })

    return {
        "handle": handle,
        "followers": user.follower_count,
        "following": user.following_count,
        "bio": user.biography or "",
        "posts_fetched": len(posts),
        "total_likes": total_likes,
        "total_comments": total_comments,
        "total_views": total_views,
        "average_likes": round(total_likes / len(posts), 2) if posts else 0.0,
        "average_comments": round(total_comments / len(posts), 2) if posts else 0.0,
        "posts": posts,
    }


def get_top_posts_with_comments(handle: str, max_posts: int = 20, top_n: int = 5, comments_per_post: int = 100) -> dict[str, Any]:
    stats = get_account_stats(handle, max_posts=max_posts)
    cl = get_instagrapi_client()

    sorted_posts = sorted(
        stats["posts"],
        key=lambda x: (x["like_count"], x["comment_count"]),
        reverse=True,
    )[:top_n]

    for post in sorted_posts:
        media_id = cl.media_pk_from_code(post["shortcode"])
        comments = cl.media_comments(media_id, amount=comments_per_post)
        post["comments"] = [
            {
                "pk": c.pk,
                "text": c.text,
                "username": c.user.username if c.user else None,
                "created_at_utc": c.created_at_utc.isoformat() if c.created_at_utc else None,
                "like_count": c.like_count,
            }
            for c in comments
        ]

    stats["top_posts"] = sorted_posts
    return stats


def export_comments_for_sentiment(handle: str, max_posts: int = 20, top_n: int = 5, comments_per_post: int = 100, out_csv: str = "output/instagram_comments.csv") -> str:
    data = get_top_posts_with_comments(handle, max_posts=max_posts, top_n=top_n, comments_per_post=comments_per_post)
    rows = []
    for post in data["top_posts"]:
        for c in post.get("comments", []):
            rows.append({
                "handle": data["handle"],
                "shortcode": post["shortcode"],
                "permalink": post["permalink"],
                "post_likes": post["like_count"],
                "post_comments": post["comment_count"],
                "comment_pk": c["pk"],
                "comment_text": c["text"],
                "comment_username": c["username"],
                "comment_created_at_utc": c["created_at_utc"],
                "comment_like_count": c["like_count"],
            })

    out_path = Path(out_csv)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else [
            "handle","shortcode","permalink","post_likes","post_comments","comment_pk","comment_text","comment_username","comment_created_at_utc","comment_like_count"
        ])
        writer.writeheader()
        writer.writerows(rows)

    return str(out_path)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(description="Instagram instagrapi smoke test (run from backend/: python test.py HANDLE)")
    p.add_argument("handle", nargs="?", default="instagram", help="Instagram username (no @)")
    p.add_argument("--max-posts", type=int, default=5, help="Posts to fetch (default 5 for quick test)")
    p.add_argument("--comments", action="store_true", help="Also fetch comments for top posts (slower)")
    args = p.parse_args()

    try:
        if args.comments:
            out = get_top_posts_with_comments(args.handle, max_posts=args.max_posts, top_n=3, comments_per_post=20)
        else:
            out = get_account_stats(args.handle, max_posts=args.max_posts)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    # Compact JSON to stdout (truncate post captions in display)
    if "posts" in out and isinstance(out["posts"], list):
        slim = {**out, "posts": [{k: v for k, v in post.items() if k != "caption" or len(str(v)) <= 120} for post in out["posts"]]}
        for post in slim.get("posts", []):
            if "caption" in post and len(post["caption"]) > 120:
                post["caption"] = post["caption"][:117] + "..."
        out = slim

    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()

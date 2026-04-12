from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openai_api_key: str = Field(..., alias="OPENAI_API_KEY")

    # Primary model (set OPENAI_MODEL=gpt-4o in .env for heavier reasoning; mini saves ~10× tokens/cost)
    openai_model: str = Field("gpt-4o-mini", alias="OPENAI_MODEL")
    # Fast / cheap model for routing, structuring, critics
    openai_model_fast: str = Field("gpt-4o-mini", alias="OPENAI_MODEL_FAST")
    # Hard caps on prompt size sent to Chat Completions (characters, UTF-8 safe truncation in llm.py)
    llm_max_system_chars: int = Field(10_000, alias="LLM_MAX_SYSTEM_CHARS", ge=2_000, le=200_000)
    llm_max_user_chars: int = Field(14_000, alias="LLM_MAX_USER_CHARS", ge=2_000, le=300_000)

    web_search_tool: str = Field(
        "web_search_preview",
        alias="OPENAI_WEB_SEARCH_TOOL",
        description="web_search or web_search_preview per account capabilities",
    )

    max_image_variants: int = Field(4, alias="OPENAI_MAX_IMAGES", ge=0, le=8)
    max_schedule_post_images: int = Field(
        24,
        alias="MAX_SCHEDULE_POST_IMAGES",
        ge=0,
        le=120,
        description="Cap total generated images for scheduled posts (cost control).",
    )
    image_generation_concurrency: int = Field(
        4,
        alias="IMAGE_GENERATION_CONCURRENCY",
        ge=1,
        le=32,
        description="Parallel Pix HTTP image fetches (async). Lower = gentler on your image endpoint.",
    )
    max_variants_per_post: int = Field(
        3,
        alias="MAX_IMAGE_VARIANTS_PER_POST",
        ge=1,
        le=4,
        description="Alternate renders per post when the model requests extras.",
    )
    media_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent.parent / "data" / "media",
        alias="MEDIA_ROOT",
    )
    image_http_template: str = Field(
        "https://pix.praanav.in/generate-image?text={prompt}",
        alias="IMAGE_HTTP_TEMPLATE",
        description="Pranav Pix: GET URL returning image/webp; use {prompt} (URL-encoded) or {prompt_raw}",
    )

    # Critic / refinement — scores are 0–100 per channel from the QA critic node
    critic_score_threshold_avg: float = Field(75.0, alias="CRITIC_SCORE_THRESHOLD_AVG")
    critic_score_threshold_min: float = Field(60.0, alias="CRITIC_SCORE_THRESHOLD_MIN")
    critic_max_refine_rounds: int = Field(2, alias="CRITIC_MAX_REFINE_ROUNDS", ge=1, le=5)

    http_timeout_s: float = Field(25.0, alias="HTTP_TIMEOUT_S")
    max_brand_page_chars: int = Field(32_000, alias="MAX_BRAND_PAGE_CHARS")
    cors_origins: str = Field("http://localhost:5173", alias="CORS_ORIGINS")
    # Comma-separated Firebase Auth emails allowed to call /api/admin/* and view the admin UI.
    admin_emails: str = Field("pranav.narkhede@somaiya.edu", alias="ADMIN_EMAILS")
    # Used in QR payloads and CORS for public landing (scan → open app URL).
    public_app_url: str = Field("http://localhost:5173", alias="PUBLIC_APP_URL")

    # YouTube Data API v3
    youtube_api_key: str = Field("", alias="YOUTUBE_API_KEY")

    # Instagram (instagrapi) — use a secondary/burner account
    instagrapi_username: str = Field("", alias="INSTAGRAPI_USERNAME")
    instagrapi_password: str = Field("", alias="INSTAGRAPI_PASSWORD")
    # Browser cookie `sessionid` (instagram.com) — use when password login fails (FB-linked / IP block).
    instagrapi_session_id: str = Field("", alias="INSTAGRAPI_SESSION_ID")
    instagrapi_session_file: str = Field(
        "backend/instagrapi_session.json", alias="INSTAGRAPI_SESSION_FILE"
    )
    # Comma- or newline-separated HTTP(S) proxy URLs (real hostname, not the word "host").
    instagrapi_proxies: str = Field("", alias="INSTAGRAPI_PROXIES")

    @field_validator("instagrapi_proxies", mode="after")
    @classmethod
    def instagrapi_proxies_not_placeholder(cls, v: str) -> str:
        if not (v or "").strip():
            return v
        for part in v.replace("\n", ",").split(","):
            p = part.strip()
            if not p:
                continue
            u = urlparse(p)
            hn = (u.hostname or "").lower()
            if hn == "host":
                raise ValueError(
                    "INSTAGRAPI_PROXIES uses the placeholder hostname 'host' (DNS cannot resolve it). "
                    "Paste the real proxy hostname from your provider, e.g. "
                    "http://USER:PASS@gw.example-proxy.com:8080 — or remove INSTAGRAPI_PROXIES to connect directly."
                )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.replace("\n", ",").split(",") if e.strip()}

    @property
    def instagrapi_proxy_list(self) -> list[str]:
        raw = self.instagrapi_proxies.replace("\n", ",")
        return [p.strip() for p in raw.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()

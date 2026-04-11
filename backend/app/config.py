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

    # Primary model for reasoning + tool use (Responses API)
    openai_model: str = Field("gpt-4o", alias="OPENAI_MODEL")
    # Fallback / fast model for structuring and light tasks
    openai_model_fast: str = Field("gpt-4o-mini", alias="OPENAI_MODEL_FAST")

    web_search_tool: str = Field(
        "web_search_preview",
        alias="OPENAI_WEB_SEARCH_TOOL",
        description="web_search or web_search_preview per account capabilities",
    )

    image_model: str = Field("dall-e-3", alias="OPENAI_IMAGE_MODEL")
    max_image_variants: int = Field(4, alias="OPENAI_MAX_IMAGES", ge=0, le=8)
    media_root: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parent.parent / "data" / "media",
        alias="MEDIA_ROOT",
    )
    image_provider: str = Field(
        "http",
        alias="IMAGE_PROVIDER",
        description="http (Pix / custom GET → raw image) or openai (DALL·E)",
    )
    image_http_template: str = Field(
        "https://pix.praanav.in/generate-image?text={prompt}",
        alias="IMAGE_HTTP_TEMPLATE",
        description="GET URL; use {prompt} (URL-encoded) or {prompt_raw} for literal text",
    )

    http_timeout_s: float = Field(25.0, alias="HTTP_TIMEOUT_S")
    max_brand_page_chars: int = Field(48_000, alias="MAX_BRAND_PAGE_CHARS")
    cors_origins: str = Field("http://localhost:5173", alias="CORS_ORIGINS")
    # Used in QR payloads and CORS for public landing (scan → open app URL).
    public_app_url: str = Field("http://localhost:5173", alias="PUBLIC_APP_URL")

    # Instagram (instagrapi) — use a secondary/burner account
    instagrapi_username: str = Field("", alias="INSTAGRAPI_USERNAME")
    instagrapi_password: str = Field("", alias="INSTAGRAPI_PASSWORD")
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
    def instagrapi_proxy_list(self) -> list[str]:
        raw = self.instagrapi_proxies.replace("\n", ",")
        return [p.strip() for p in raw.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def clear_settings_cache() -> None:
    get_settings.cache_clear()

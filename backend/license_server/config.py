from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    LICENSE_JWT_SECRET: str = "change-me-in-production"
    ADMIN_SECRET: str = "change-admin-secret"
    TOKEN_EXPIRE_DAYS: int = 7
    APP_LATEST_VERSION: str = "0.1.0"
    APP_UPDATE_URL: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()

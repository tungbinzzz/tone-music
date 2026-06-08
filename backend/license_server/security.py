import jwt
from datetime import datetime, timedelta, timezone
from config import settings
import logging

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"

def create_offline_token(payload: dict) -> str:
    """Create a JWT offline token valid for TOKEN_EXPIRE_DAYS days."""
    data = payload.copy()
    now = datetime.now(timezone.utc)
    data["iat"] = now
    data["exp"] = now + timedelta(days=settings.TOKEN_EXPIRE_DAYS)
    return jwt.encode(data, settings.LICENSE_JWT_SECRET, algorithm=ALGORITHM)

def verify_offline_token(token: str) -> dict | None:
    """Verify and decode a JWT offline token. Returns None if invalid/expired."""
    try:
        payload = jwt.decode(
            token,
            settings.LICENSE_JWT_SECRET,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "license_key", "machine_id"]},
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("Offline token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Invalid offline token: {e}")
        return None

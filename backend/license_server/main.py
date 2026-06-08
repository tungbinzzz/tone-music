import logging
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from schemas import ActivateRequest, VerifyRequest, DeactivateRequest
from license_service import activate_license, verify_license, deactivate_license
from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ToneLink License Server",
    description="License management API for ToneLink — TC Studio",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "service": "ToneLink License Server", "version": "1.0.0"}


@app.post("/license/activate", tags=["License"])
def activate(req: ActivateRequest):
    logger.info(f"Activate request: key={req.license_key[:8]}... machine={req.machine_id[:8]}...")
    try:
        return activate_license(req)
    except Exception as e:
        logger.error(f"Activation error: {e}", exc_info=True)
        return {"valid": False, "message": "Server error — please try again later"}


@app.post("/license/verify", tags=["License"])
def verify(req: VerifyRequest):
    logger.info(f"Verify request: key={req.license_key[:8]}... machine={req.machine_id[:8]}...")
    try:
        return verify_license(req)
    except Exception as e:
        logger.error(f"Verify error: {e}", exc_info=True)
        return {"valid": False, "message": "Server error"}


@app.post("/license/deactivate", tags=["License"])
def deactivate(req: DeactivateRequest):
    try:
        return deactivate_license(req.license_key, req.machine_id)
    except Exception as e:
        logger.error(f"Deactivate error: {e}", exc_info=True)
        return {"success": False, "message": "Server error"}


@app.get("/update/check", tags=["Updates"])
def check_update(
    version: str = Query(default="0.0.0"),
    platform: str = Query(default="win32"),
):
    try:
        from supabase_client import get_supabase
        supabase = get_supabase()
        res = supabase.table("app_updates").select("*") \
            .eq("platform", platform) \
            .order("created_at", desc=True) \
            .limit(1).execute()

        if res.data:
            latest = res.data[0]
            has_update = latest["version"] != version
            return {
                "has_update": has_update,
                "latest_version": latest["version"],
                "url": latest["url"] if has_update else None,
                "changelog": latest.get("changelog"),
                "is_required": latest.get("is_required", False),
            }
    except Exception as e:
        logger.warning(f"Update check DB error: {e}")

    return {
        "has_update": False,
        "latest_version": settings.APP_LATEST_VERSION,
        "url": settings.APP_UPDATE_URL or None,
        "changelog": None,
        "is_required": False,
    }

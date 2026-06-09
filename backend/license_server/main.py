import logging
import secrets
import string
from typing import Optional
from fastapi import FastAPI, Query, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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


# ─── Admin endpoints ──────────────────────────────────────────────────────────
# All admin endpoints require header: X-Admin-Key: <ADMIN_SECRET>

def require_admin(x_admin_key: str = Header(...)):
    if not secrets.compare_digest(x_admin_key, settings.ADMIN_SECRET):
        raise HTTPException(status_code=403, detail="Invalid admin key")


class CreateLicenseRequest(BaseModel):
    plan: str = "standard"
    max_devices: int = 1
    expires_days: Optional[int] = None   # None = lifetime
    note: Optional[str] = None           # internal note, stored as user name


def _generate_key() -> str:
    """Generate key format: TC-XXXX-XXXX-XXXX"""
    chars = string.ascii_uppercase + string.digits
    parts = ["".join(secrets.choice(chars) for _ in range(4)) for _ in range(3)]
    return "TC-" + "-".join(parts)


@app.post("/admin/create-license", tags=["Admin"])
def admin_create_license(
    req: CreateLicenseRequest,
    x_admin_key: str = Header(...),
):
    require_admin(x_admin_key)
    supabase = __import__("supabase_client").get_supabase()

    # Generate unique key
    for _ in range(10):
        key = _generate_key()
        exists = supabase.table("licenses").select("id").eq("license_key", key).execute()
        if not exists.data:
            break

    expires_at = None
    if req.expires_days:
        from datetime import datetime, timedelta, timezone
        expires_at = (datetime.now(timezone.utc) + timedelta(days=req.expires_days)).isoformat()

    # Create user record if note provided
    user_id = None
    if req.note:
        user_res = supabase.table("users").insert({
            "email": f"{key.lower()}@tcstudio.internal",
            "name": req.note,
        }).execute()
        if user_res.data:
            user_id = user_res.data[0]["id"]

    supabase.table("licenses").insert({
        "license_key": key,
        "plan": req.plan,
        "status": "active",
        "max_devices": req.max_devices,
        "expires_at": expires_at,
        "user_id": user_id,
    }).execute()

    logger.info(f"Admin created license: {key} plan={req.plan} devices={req.max_devices}")
    return {
        "license_key": key,
        "plan": req.plan,
        "max_devices": req.max_devices,
        "expires_at": expires_at,
        "note": req.note,
    }


@app.get("/admin/licenses", tags=["Admin"])
def admin_list_licenses(
    x_admin_key: str = Header(...),
    limit: int = Query(default=50, le=200),
):
    require_admin(x_admin_key)
    supabase = __import__("supabase_client").get_supabase()
    res = supabase.table("licenses").select(
        "id, license_key, plan, status, max_devices, expires_at, created_at, user_id, users(name)"
    ).order("created_at", desc=True).limit(limit).execute()

    licenses = []
    for lic in (res.data or []):
        act_res = supabase.table("activations").select("machine_id, machine_name, last_seen") \
            .eq("license_id", lic["id"]).execute()
        licenses.append({
            **lic,
            "activations": act_res.data or [],
            "active_devices": len(act_res.data or []),
        })
    return {"total": len(licenses), "licenses": licenses}


@app.post("/admin/revoke/{license_key}", tags=["Admin"])
def admin_revoke_license(license_key: str, x_admin_key: str = Header(...)):
    require_admin(x_admin_key)
    supabase = __import__("supabase_client").get_supabase()
    res = supabase.table("licenses").update({"status": "revoked"}) \
        .eq("license_key", license_key).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="License not found")
    logger.info(f"Admin revoked license: {license_key}")
    return {"success": True, "license_key": license_key, "status": "revoked"}


@app.post("/admin/restore/{license_key}", tags=["Admin"])
def admin_restore_license(license_key: str, x_admin_key: str = Header(...)):
    require_admin(x_admin_key)
    supabase = __import__("supabase_client").get_supabase()
    res = supabase.table("licenses").update({"status": "active"}) \
        .eq("license_key", license_key).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="License not found")
    return {"success": True, "license_key": license_key, "status": "active"}


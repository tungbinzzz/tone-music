from supabase_client import get_supabase
from security import create_offline_token
from schemas import ActivateRequest, VerifyRequest
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


def _is_expired(expires_at_str: str | None) -> bool:
    """Returns True if the expiry date has passed. None means lifetime license."""
    if not expires_at_str:
        return False
    try:
        dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
        return dt < datetime.now(timezone.utc)
    except Exception:
        return True


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_token(license_key: str, machine_id: str, plan: str, expires_at) -> str:
    return create_offline_token({
        "license_key": license_key,
        "machine_id": machine_id,
        "plan": plan,
        "expires_at": expires_at,
    })


def activate_license(req: ActivateRequest) -> dict:
    supabase = get_supabase()

    # Lookup license
    res = supabase.table("licenses").select("*").eq("license_key", req.license_key).execute()
    if not res.data:
        return {"valid": False, "message": "License key not found"}

    lic = res.data[0]

    if lic["status"] != "active":
        return {"valid": False, "message": f"License is {lic['status']}"}

    if _is_expired(lic.get("expires_at")):
        return {"valid": False, "message": "License has expired"}

    # Check existing activations
    acts_res = supabase.table("activations").select("*").eq("license_id", lic["id"]).execute()
    activations = acts_res.data or []
    existing = next((a for a in activations if a["machine_id"] == req.machine_id), None)

    if existing:
        # Update last_seen for existing activation
        supabase.table("activations").update({
            "last_seen": _now_iso(),
            "app_version": req.app_version,
            "machine_name": req.machine_name,
        }).eq("id", existing["id"]).execute()
        logger.info(f"Updated activation for license {req.license_key[:8]}...")
    else:
        if len(activations) >= lic["max_devices"]:
            return {"valid": False, "message": "DEVICE_LIMIT_REACHED"}

        supabase.table("activations").insert({
            "license_id": lic["id"],
            "machine_id": req.machine_id,
            "machine_name": req.machine_name,
            "app_version": req.app_version,
            "last_seen": _now_iso(),
        }).execute()
        logger.info(f"New activation for license {req.license_key[:8]}...")

    offline_token = _make_token(req.license_key, req.machine_id, lic["plan"], lic.get("expires_at"))

    return {
        "valid": True,
        "plan": lic["plan"],
        "offline_token": offline_token,
        "expires_at": lic.get("expires_at"),
        "message": "Activated successfully",
    }


def verify_license(req: VerifyRequest) -> dict:
    supabase = get_supabase()

    res = supabase.table("licenses").select("*").eq("license_key", req.license_key).execute()
    if not res.data:
        return {"valid": False, "message": "License not found"}

    lic = res.data[0]

    if lic["status"] != "active":
        return {"valid": False, "message": f"License is {lic['status']}"}

    if _is_expired(lic.get("expires_at")):
        return {"valid": False, "message": "License expired"}

    act_res = supabase.table("activations").select("*") \
        .eq("license_id", lic["id"]).eq("machine_id", req.machine_id).execute()

    if not act_res.data:
        return {"valid": False, "message": "Device not registered"}

    # Refresh last_seen
    supabase.table("activations").update({
        "last_seen": _now_iso(),
        "app_version": req.app_version,
    }).eq("id", act_res.data[0]["id"]).execute()

    offline_token = _make_token(req.license_key, req.machine_id, lic["plan"], lic.get("expires_at"))

    return {
        "valid": True,
        "plan": lic["plan"],
        "offline_token": offline_token,
        "expires_at": lic.get("expires_at"),
        "message": "Valid",
    }


def deactivate_license(license_key: str, machine_id: str) -> dict:
    supabase = get_supabase()

    res = supabase.table("licenses").select("id").eq("license_key", license_key).execute()
    if not res.data:
        return {"success": False, "message": "License not found"}

    supabase.table("activations").delete() \
        .eq("license_id", res.data[0]["id"]).eq("machine_id", machine_id).execute()

    logger.info(f"Deactivated machine {machine_id[:8]}... for license {license_key[:8]}...")
    return {"success": True, "message": "Deactivated successfully"}

import logging
import hashlib
import secrets
import string
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Query, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from schemas import ActivateRequest, VerifyRequest, DeactivateRequest, KnownSongUpsertRequest
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

VALID_TONE_SUFFIXES = (" major", " minor")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_identity(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _is_valid_tone(tone: str | None) -> bool:
    text = (tone or "").strip()
    return bool(text and text != "--" and text.endswith(VALID_TONE_SUFFIXES))


def _normalize_transitions(transitions) -> list[dict]:
    rows = []
    for item in transitions or []:
        tone = str((item.get("tone") if isinstance(item, dict) else getattr(item, "tone", "")) or "").strip()
        if not _is_valid_tone(tone):
            continue
        try:
            raw_time = item.get("time") if isinstance(item, dict) else getattr(item, "time", 0)
            time_value = max(0.0, float(raw_time or 0))
        except Exception:
            continue
        rows.append({"time": round(time_value, 2), "tone": tone})

    rows.sort(key=lambda item: item["time"])
    merged = []
    for item in rows:
        duplicate = next(
            (
                existing for existing in merged
                if existing["tone"] == item["tone"] and abs(existing["time"] - item["time"]) <= 8
            ),
            None,
        )
        if duplicate:
            duplicate["time"] = round(min(duplicate["time"], item["time"]), 2)
        else:
            merged.append(item)
    return merged[:6]


def _merge_transitions(existing, incoming) -> list[dict]:
    combined = []
    for item in (existing or []) + (incoming or []):
        tone = str(item.get("tone", "")).strip() if isinstance(item, dict) else ""
        if not _is_valid_tone(tone):
            continue
        try:
            time_value = max(0.0, float(item.get("time", 0) or 0))
        except Exception:
            continue
        combined.append({"time": time_value, "tone": tone})
    return _normalize_transitions(combined)


def _require_active_activation(supabase, license_key: str, machine_id: str) -> dict:
    res = supabase.table("licenses").select("*").eq("license_key", license_key).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="License not found")

    lic = res.data[0]
    if lic["status"] != "active":
        raise HTTPException(status_code=403, detail=f"License is {lic['status']}")

    expires_at = lic.get("expires_at")
    if expires_at:
        try:
            expires_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_dt < datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="License expired")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=403, detail="License expired")

    act_res = supabase.table("activations").select("id").eq("license_id", lic["id"]).eq("machine_id", machine_id).execute()
    if not act_res.data:
        raise HTTPException(status_code=403, detail="Device not registered")
    return lic


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


@app.get("/known-songs/{video_id}", tags=["Known Songs"])
def get_known_song(video_id: str):
    try:
        from supabase_client import get_supabase
        supabase = get_supabase()
        res = supabase.table("known_songs").select(
            "video_id,title,url,duration,main_tone,transitions,contribution_count,updated_at"
        ).eq("video_id", video_id).limit(1).execute()
        if not res.data:
            return {"found": False}
        return {"found": True, "song": res.data[0]}
    except Exception as e:
        logger.warning(f"Known song lookup failed: {e}")
        return {"found": False, "message": "Known song lookup failed"}


@app.post("/known-songs", tags=["Known Songs"])
def upsert_known_song(req: KnownSongUpsertRequest):
    video_id = req.video_id.strip()
    main_tone = req.main_tone.strip()
    if not video_id:
        raise HTTPException(status_code=400, detail="Missing video_id")
    if not _is_valid_tone(main_tone):
        raise HTTPException(status_code=400, detail="Missing main_tone")

    try:
        from supabase_client import get_supabase
        supabase = get_supabase()
        _require_active_activation(supabase, req.license_key.strip().upper(), req.machine_id.strip())

        incoming_transitions = _normalize_transitions(req.transitions)
        existing_res = supabase.table("known_songs").select("*").eq("video_id", video_id).limit(1).execute()
        existing = existing_res.data[0] if existing_res.data else None
        contributor_hash = _hash_identity(f"{req.license_key.strip().upper()}:{req.machine_id.strip()}")

        if existing:
            merged_transitions = _merge_transitions(existing.get("transitions") or [], incoming_transitions)
            update_row = {
                "title": req.title.strip() or existing.get("title") or video_id,
                "url": req.url or existing.get("url") or "",
                "duration": max(float(req.duration or 0), float(existing.get("duration") or 0)),
                "main_tone": existing.get("main_tone") or main_tone,
                "transitions": merged_transitions,
                "contribution_count": int(existing.get("contribution_count") or 0) + 1,
                "last_contributor_hash": contributor_hash,
                "last_app_version": req.app_version,
                "updated_at": _now_iso(),
            }
            res = supabase.table("known_songs").update(update_row).eq("video_id", video_id).execute()
        else:
            insert_row = {
                "video_id": video_id,
                "title": req.title.strip() or video_id,
                "url": req.url or "",
                "duration": max(0, float(req.duration or 0)),
                "main_tone": main_tone,
                "transitions": incoming_transitions,
                "contribution_count": 1,
                "last_contributor_hash": contributor_hash,
                "last_app_version": req.app_version,
            }
            res = supabase.table("known_songs").insert(insert_row).execute()

        return {"saved": True, "song": (res.data or [None])[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Known song upsert failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Known song upsert failed")


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


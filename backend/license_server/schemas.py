from pydantic import BaseModel
from typing import Optional

class ActivateRequest(BaseModel):
    license_key: str
    machine_id: str
    machine_name: Optional[str] = None
    app_version: Optional[str] = None

class VerifyRequest(BaseModel):
    license_key: str
    machine_id: str
    offline_token: Optional[str] = None
    app_version: Optional[str] = None

class DeactivateRequest(BaseModel):
    license_key: str
    machine_id: str

class LicenseResponse(BaseModel):
    valid: bool
    plan: Optional[str] = None
    offline_token: Optional[str] = None
    expires_at: Optional[str] = None
    message: str

class UpdateResponse(BaseModel):
    has_update: bool
    latest_version: str
    url: Optional[str] = None
    changelog: Optional[str] = None
    is_required: bool = False

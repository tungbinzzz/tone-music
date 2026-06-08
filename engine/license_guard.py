"""
License guard for ToneLink engine.
Verifies that a valid license exists before allowing tone detection to start.
"""
import json
import os
import sys
import logging
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _get_user_data_path() -> Path:
    """Get the Electron userData path for the current platform."""
    system = platform.system()
    if system == "Windows":
        app_data = os.environ.get("APPDATA", "")
        return Path(app_data) / "cubase-youtube-tone-assistant"
    elif system == "Darwin":
        home = Path.home()
        return home / "Library" / "Application Support" / "cubase-youtube-tone-assistant"
    else:
        config = os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))
        return Path(config) / "cubase-youtube-tone-assistant"


def _read_license() -> Optional[dict]:
    """Read license.json from userData directory."""
    # Allow override via environment variable (useful for testing)
    license_path_env = os.environ.get("TONELINK_LICENSE_PATH")
    if license_path_env:
        license_path = Path(license_path_env)
    else:
        license_path = _get_user_data_path() / "license.json"

    try:
        if not license_path.exists():
            logger.warning(f"License file not found: {license_path}")
            return None
        with open(license_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read license file: {e}")
        return None


def _is_offline_valid(license_data: dict) -> bool:
    """Check if the offline token is still within its validity window."""
    exp_str = license_data.get("offlineTokenExp")
    if not exp_str:
        return False
    try:
        exp = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
        return exp > datetime.now(timezone.utc)
    except Exception:
        return False


def _verify_online(license_data: dict) -> bool:
    """Try to verify license online. Returns True if valid."""
    try:
        import urllib.request
        import urllib.error

        server_url = os.environ.get(
            "LICENSE_SERVER_URL",
            "https://tone-music-production.up.railway.app"
        )
        url = f"{server_url}/license/verify"
        payload = json.dumps({
            "license_key": license_data.get("licenseKey", ""),
            "machine_id": license_data.get("machineId", ""),
            "offline_token": license_data.get("offlineToken"),
            "app_version": os.environ.get("APP_VERSION", "0.1.0"),
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result.get("valid", False)

    except Exception as e:
        logger.warning(f"Online verify failed: {e}")
        return False


class LicenseGuard:
    """
    Guard that checks license validity before allowing engine operations.
    """

    def __init__(self, skip_check: bool = False):
        self._valid: Optional[bool] = None
        self._plan: str = "unknown"
        self._source: str = "none"
        self._skip_check = skip_check

    def check(self) -> bool:
        """Perform license check. Returns True if valid."""
        if self._skip_check:
            logger.info("License check skipped (development mode)")
            self._valid = True
            return True

        license_data = _read_license()

        if not license_data:
            logger.error("No license found. Engine will not start.")
            self._valid = False
            return False

        # Try online verification first
        if _verify_online(license_data):
            self._valid = True
            self._plan = license_data.get("plan", "standard")
            self._source = "online"
            logger.info(f"License verified online. Plan: {self._plan}")
            return True

        # Fall back to offline token check
        if _is_offline_valid(license_data):
            self._valid = True
            self._plan = license_data.get("plan", "standard")
            self._source = "offline"
            exp = license_data.get("offlineTokenExp", "")[:10]
            logger.info(f"License verified offline (expires {exp}). Plan: {self._plan}")
            return True

        logger.error("License invalid or offline token expired.")
        self._valid = False
        return False

    @property
    def is_valid(self) -> bool:
        if self._valid is None:
            return self.check()
        return self._valid

    @property
    def plan(self) -> str:
        return self._plan

    @property
    def source(self) -> str:
        return self._source


# Module-level guard instance
_guard: Optional[LicenseGuard] = None


def init_guard(skip_check: bool = False) -> LicenseGuard:
    """Initialize the license guard. Call once at engine startup."""
    global _guard
    _guard = LicenseGuard(skip_check=skip_check)
    return _guard


def is_licensed() -> bool:
    """Check if the engine is licensed to run."""
    if _guard is None:
        raise RuntimeError("License guard not initialized. Call init_guard() first.")
    return _guard.is_valid

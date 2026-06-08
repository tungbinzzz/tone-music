'use strict';
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Replace with your Railway URL after deploy
const LICENSE_SERVER_URL = process.env.LICENSE_SERVER_URL || 'https://your-license-server.railway.app';
const LICENSE_TIMEOUT_MS = 8000;

/**
 * Generate a stable machine ID from hardware info (no native deps).
 */
function getMachineId() {
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
    .map(i => i.mac)
    .sort()
    .join(',');

  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    (os.cpus()[0] || {}).model || '',
    macs,
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Simple HTTP/HTTPS fetch for Node.js without node-fetch.
 */
function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      timeout: LICENSE_TIMEOUT_MS,
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ ok: false, status: res.statusCode, data: {} }); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Get the path to license.json in userData.
 */
function getLicensePath(app) {
  return path.join(app.getPath('userData'), 'license.json');
}

/**
 * Read stored license data.
 */
function readLicense(app) {
  try {
    const p = getLicensePath(app);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write license data.
 */
function writeLicense(app, data) {
  try {
    fs.writeFileSync(getLicensePath(app), JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[License] Failed to write license.json:', e.message);
    return false;
  }
}

/**
 * Delete license file (for deactivation).
 */
function clearLicense(app) {
  try {
    const p = getLicensePath(app);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* ignore */ }
}

/**
 * Check if the stored offline token is still valid (by expiry date).
 */
function isOfflineValid(license) {
  if (!license || !license.offlineTokenExp) return false;
  return new Date(license.offlineTokenExp) > new Date();
}

/**
 * Activate a license key online.
 * Returns { valid, plan, message, offlineToken, expiresAt }
 */
async function activateLicense(app, licenseKey) {
  const machineId = getMachineId();
  const machineInfo = {
    license_key: licenseKey.trim().toUpperCase(),
    machine_id: machineId,
    machine_name: os.hostname(),
    app_version: app.getVersion(),
  };

  try {
    const res = await fetchJson(`${LICENSE_SERVER_URL}/license/activate`, {
      method: 'POST',
      body: JSON.stringify(machineInfo),
    });

    if (!res.data.valid) {
      return { valid: false, message: res.data.message || 'Activation failed' };
    }

    // Compute offline token expiry (7 days from now as fallback)
    const offlineTokenExp = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const licenseData = {
      licenseKey: machineInfo.license_key,
      machineId,
      plan: res.data.plan,
      offlineToken: res.data.offline_token,
      offlineTokenExp,
      expiresAt: res.data.expires_at || null,
      activatedAt: new Date().toISOString(),
      lastVerified: new Date().toISOString(),
    };

    writeLicense(app, licenseData);
    return { valid: true, plan: res.data.plan, message: res.data.message };
  } catch (e) {
    console.error('[License] Activate error:', e.message);
    return { valid: false, message: 'Cannot reach license server. Check your internet connection.' };
  }
}

/**
 * Verify license — online if possible, offline fallback.
 * Returns { valid, plan, source, message }
 */
async function verifyLicense(app) {
  const stored = readLicense(app);
  if (!stored) return { valid: false, message: 'Not activated', source: 'none' };

  const machineId = getMachineId();
  if (stored.machineId !== machineId) {
    return { valid: false, message: 'Machine ID mismatch', source: 'local' };
  }

  // Try online verify first
  try {
    const res = await fetchJson(`${LICENSE_SERVER_URL}/license/verify`, {
      method: 'POST',
      body: JSON.stringify({
        license_key: stored.licenseKey,
        machine_id: machineId,
        offline_token: stored.offlineToken,
        app_version: app.getVersion(),
      }),
    });

    if (res.data.valid) {
      // Refresh token
      const offlineTokenExp = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      writeLicense(app, {
        ...stored,
        offlineToken: res.data.offline_token || stored.offlineToken,
        offlineTokenExp,
        lastVerified: new Date().toISOString(),
      });
      return { valid: true, plan: res.data.plan, message: 'Online verified', source: 'online' };
    } else {
      // Server says invalid — check offline grace period
      if (isOfflineValid(stored)) {
        return { valid: true, plan: stored.plan, message: 'Offline mode (grace period)', source: 'offline' };
      }
      clearLicense(app);
      return { valid: false, message: res.data.message || 'License revoked', source: 'online' };
    }
  } catch (e) {
    // Server unreachable — use offline token
    console.warn('[License] Server unreachable, using offline token:', e.message);
    if (isOfflineValid(stored)) {
      return { valid: true, plan: stored.plan, message: `Offline mode (expires ${stored.offlineTokenExp?.slice(0, 10)})`, source: 'offline' };
    }
    return { valid: false, message: 'Offline token expired. Please connect to internet to re-verify.', source: 'offline' };
  }
}

/**
 * Deactivate license from current machine.
 */
async function deactivateLicense(app) {
  const stored = readLicense(app);
  if (!stored) return { success: true, message: 'No license to deactivate' };

  try {
    await fetchJson(`${LICENSE_SERVER_URL}/license/deactivate`, {
      method: 'POST',
      body: JSON.stringify({
        license_key: stored.licenseKey,
        machine_id: getMachineId(),
      }),
    });
  } catch (e) {
    console.warn('[License] Deactivate server call failed:', e.message);
  }

  clearLicense(app);
  return { success: true, message: 'Deactivated' };
}

/**
 * Check for app updates.
 */
async function checkUpdate(currentVersion, platform = process.platform) {
  try {
    const url = `${LICENSE_SERVER_URL}/update/check?version=${encodeURIComponent(currentVersion)}&platform=${encodeURIComponent(platform)}`;
    const res = await fetchJson(url);
    return res.data;
  } catch (e) {
    console.warn('[License] Update check failed:', e.message);
    return { has_update: false, latest_version: currentVersion };
  }
}

module.exports = {
  getMachineId,
  activateLicense,
  verifyLicense,
  deactivateLicense,
  checkUpdate,
  readLicense,
};

# ToneLink License System — Hướng dẫn Deploy

## Kiến trúc tổng quan

```
Electron App  ──► FastAPI (Railway)  ──► Supabase (PostgreSQL)
Python Engine ──► license.json (local) + FastAPI verify
```

---

## Bước 1 — Tạo Supabase project

1. Vào [supabase.com](https://supabase.com) → New project
2. Vào **SQL Editor** → chạy toàn bộ nội dung file `backend/license_server/schema.sql`
3. Lấy thông tin từ **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Bước 2 — Deploy FastAPI lên Railway

### Chuẩn bị repo
Đảm bảo `backend/license_server/` đã được push lên GitHub.

### Deploy
1. Vào [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Chọn repository, set **Root Directory** = `backend/license_server`
3. Railway tự detect Python và dùng `railway.json` để build

### Set Environment Variables trên Railway

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` |
| `LICENSE_JWT_SECRET` | *(generate: `openssl rand -hex 32`)* |
| `TOKEN_EXPIRE_DAYS` | `7` |
| `APP_LATEST_VERSION` | `0.1.0` |
| `APP_UPDATE_URL` | *(GitHub releases URL)* |

4. Sau deploy, copy **Public URL** của Railway (vd: `https://tonelink-license.railway.app`)

---

## Bước 3 — Cấu hình Electron App

Mở `src/main/licenseClient.js`, đổi:
```js
const LICENSE_SERVER_URL = 'https://tonelink-license.railway.app';
```

Hoặc set environment variable khi build:
```
LICENSE_SERVER_URL=https://tonelink-license.railway.app
```

---

## Bước 4 — Tạo license key test

Chạy SQL trong Supabase SQL Editor:
```sql
INSERT INTO licenses (license_key, plan, status, max_devices)
VALUES ('TL-TEST-1234-ABCD', 'standard', 'active', 2);
```

---

## Test local

### 1. Test FastAPI server
```bash
cd backend/license_server
pip install -r requirements.txt
cp .env.example .env  # điền thông tin thật
uvicorn main:app --reload
```

Mở `http://localhost:8000/docs` để test API.

### 2. Test activate
```bash
curl -X POST http://localhost:8000/license/activate \
  -H "Content-Type: application/json" \
  -d '{"license_key":"TL-TEST-1234-ABCD","machine_id":"test-machine-001","machine_name":"Test PC","app_version":"0.1.0"}'
```

### 3. Test Electron app
```bash
cd c:\Users\Windows\Documents\nhac
npm start
```

App sẽ hiện màn hình kích hoạt nếu chưa có `license.json`.

### 4. Test engine dev mode (skip license)
```bash
set TONELINK_DEV=1
python engine/app.py
```

---

## Luồng license hoạt động

```
App khởi động
  │
  ├─ verifyLicense()
  │    ├─ Gọi POST /license/verify
  │    │    ├─ Valid → refresh offline token → hiện toolbar
  │    │    └─ Invalid → check offline token còn hạn?
  │    │         ├─ Còn hạn → offline mode → hiện toolbar
  │    │         └─ Hết hạn → hiện màn kích hoạt
  │    └─ Server timeout → offline fallback
  │
  └─ Màn kích hoạt: nhập key → POST /license/activate
       ├─ Valid → lưu license.json → hiện toolbar
       └─ Invalid → hiện lỗi

Tone detection start:
  └─ Python engine check is_licensed()
       ├─ Online verify → cho phép
       ├─ Offline token còn hạn → cho phép
       └─ Không hợp lệ → reply error LICENSE_INVALID
```

---

## Cấu trúc file tạo mới

```
backend/
  license_server/
    main.py              # FastAPI app, endpoints
    config.py            # Pydantic settings
    supabase_client.py   # Supabase client singleton
    schemas.py           # Request/Response models
    license_service.py   # Business logic
    security.py          # JWT offline token
    requirements.txt     # Python deps
    railway.json         # Railway deploy config
    .env.example         # Template env vars
    schema.sql           # Supabase DB schema

src/
  main/
    licenseClient.js     # Electron license client (CommonJS)
    main.js              # + licenseClient import + 5 IPC handlers

  renderer/src/
    components/
      license-screen.tsx # Activation UI
    main.tsx             # + license gate before showing app
    vite-env.d.ts        # + license method types

engine/
  license_guard.py       # Python license guard
  app.py                 # + license check in start_analyzer
```

---

## Bảo mật

- `SUPABASE_SERVICE_ROLE_KEY` **chỉ** nằm trên Railway, không bao giờ ship trong Electron
- `LICENSE_JWT_SECRET` **chỉ** nằm trên Railway
- Electron chỉ gọi public FastAPI URL
- Machine ID là SHA-256 hash, không lưu thông tin nhận dạng cá nhân
- Offline token expire sau 7 ngày buộc re-verify

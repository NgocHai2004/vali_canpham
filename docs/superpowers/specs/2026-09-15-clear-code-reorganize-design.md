# Design: Dọn dẹp & tái cấu trúc App_CCCD (clear-code)

Ngày: 2026-09-15

## Mục tiêu
Dọn dẹp toàn bộ repo về cấu trúc chuẩn, sạch, dễ bảo trì; bỏ rác/tạm/sinh ra/sao chép trùng; sửa imports & paths sau khi di chuyển; giữ nguyên chức năng hiện có; build/run không lỗi.

## Phạm vi & nguyên tắc (đã được user chốt)
- **Chỉ** tổ chức lại `app_cccd/` (dự án thật, git riêng) + xoá rác ở root `App_CCCD/`.
- **Giữ nguyên** các sub-project khác ở root (`cccd_service_src`, `dist-package`, `cccd-service-deploy`, `App_CCCD_Release`, `scan_paper`, `weight`, `kiosk`, `db_backup`, `mongo_portable`, `mongo_data`) — KHÔNG đụng.
- **Không di chuyển cấu trúc thư mục chính** `backend/`, `frontend/`, `electron/`. Các run script (`run.ps1`, `run-electron.ps1`, `start-services.ps1`) phụ thuộc cứng vào chúng và path ngoài project (`.env` root, `mongo_portable/`, `mongo_data/`, `scan_paper/`).
- **Không đụng instance Vali_hientruong** (nhánh Hai_dev, port riêng 27018/8001).
- Mức xoá: **Trung bình** — xoá rác rõ ràng + file nguồn không dùng, chuyển (không xoá) file còn giá trị.
- **Giữ nguyên** các file obfuscated/built của electron (`electron/obf/`, `electron/webdist/`, `main.js`, `config.js`) vì chúng được track và gắn với packaging pipeline → tránh phá vỡ build đóng gói.

## A. Xoá rác ở root `App_CCCD/` (không đụng sub-project)
- Debug script: `_dbg_*.py` (batch_geom, bitdepth, cccd_box, dpi, geom, hand, ink, lines, newscan, psm, validate_register, verify_fix)
- Debug image: `_cccd_*.png`, `_crop*.png`, `_crop400/`, `_dbg_*.png`, `_fps_*.png`, `_ncp_*.png`, `_crop_*.jpg`
- Temp/text: `_val*.txt`, `_val2.txt`, `_val3.txt`, `_val_out.txt`, `image.png`, `2026-09-07 21.23.14.jpg`, `2026-09-07 21.23.19.jpg`
- Rename script: `_rename_nghipham.mjs`, `_rename_nghipham.ps1`
- Dongle temp: `_tmp_dongle.key`, `_tmp_dongle.key.bak`
- Backup: `git_backup_20260908/` (1.3GB), `.env.bak_before_flags`
- Empty: `_cfgtest/`

**Giữ lại ở root**: `.env`, `.env.example`, `api.md`, `huongdan.md`, `key.md`, `run_kiosk.md`, `RUN.md`, `docker-compose.yml`, `push_capture_proxy.py`, `source_git.md`, toàn bộ sub-project.

## B. Dọn trong `app_cccd/` — build/runtime artifacts (gitignored, tái tạo được)
- `.venv/`, `frontend/node_modules/`, `electron/node_modules/`
- `frontend/dist/`, `backend/build/`, `backend/dist/`
- `electron/app.asar` (326MB) + `app.asar.unpacked/`
- `backend/uploads/`, `backend/data_cccd/`, `backend/fp/`
- `logs/`, `__pycache__/`, `.pytest_cache/`
- `kiosk/edge-profile/` (runtime browser profile)

## C. Dọn file nguồn trong `app_cccd/`
**Xoá** (đã xác minh không được import / là dev-probe / là export tái tạo được):
- `frontend/src/probe.jsx`, `frontend/src/probeFps.jsx`, `frontend/probe.html`, `frontend/probe-fps.html` — nhóm dev-probe độc lập, không app nào import
- `_oa.json` — OpenAPI export (tái tạo bằng `app.openapi()`)

**Di chuyển** (giữ giá trị, sắp đúng chỗ):
- `main_source_ref.js` → `electron/main.source.js` (nguồn readable của `main.js` obfuscated)
- `design.md`, `design-preview-a4.md` → `docs/design-a4/` (tài liệu thiết kế form A4)

**Cập nhật tài liệu**:
- `README.md`: `fingerprint_service` → `morfin_service` (đã đổi service thật)
- `backend/services/README.md`: đối chiếu danh sách service thực tế

## D. Fix imports & paths
- Vì không di chuyển cấu trúc chính → hầu hết import không đổi.
- `run.ps1` + `RUN.md`: sửa tham chiếu `backend/services/fingerprint_service/requirements.txt` (không tồn tại) → `backend/services/morfin_service/requirements.txt` (lỗi latent có sẵn).
- `.gitignore`: thêm rules cho artifact đã xoá (`electron/app.asar.unpacked/`, `backend/build/`, `backend/dist/`, `frontend/dist/`) — `app.asar` đã có.

## E. Verify build/run
- `npm run build` frontend (đảm bảo không lỗi sau khi xoá probe files)
- Backend import-check (`python -c "import main"` với cwd backend) + health nếu Mongo chạy
- Không build electron đóng gói (tránh chạm packaging/instance đang chạy)

## Rủi ro & giảm thiểu
- Instance Vali_hientruong đang chạy song song → chỉ dọn trong repo này, không kill process/port của nó.
- File obfuscated electron không đụng → không phá build đóng gói.
- Mọi thứ xoá đều là untracked/regenerable hoặc dev-only đã xác minh → có thể phục hồi bằng git nếu cần (trước khi commit).
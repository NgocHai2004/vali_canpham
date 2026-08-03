# App_CCCD Electron Migration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay lớp hiển thị Edge kiosk bằng một app Electron làm vỏ + orchestrator, quản lý vòng đời backend Python / Mongo, khóa kiosk chống người dùng cuối, và bỏ Vite dev server — trong khi giữ nguyên frontend React và backend Python hiện có.

**Architecture:** Electron main process (Node) spawn và giám sát các tiến trình con (backend uvicorn từ venv, mongod portable), phục vụ frontend đã build qua custom `app://` protocol, và proxy các request `/api` `/fp` `/usb` `/uploads` (kể cả WebSocket) tới đúng port backend — thay thế vai trò proxy của Vite. Cửa sổ chạy fullscreen kiosk, chặn phím tắt và DevTools, với một dev escape hatch (Ctrl+Shift+Q) chỉ tồn tại trong build `dev`.

**Tech Stack:** Electron, Node built-in `http`/`net` (proxy + health poll), electron `session.protocol` (app:// serving), Vite (chỉ dùng `build`, không dùng dev server), frontend React 19 hiện có, backend FastAPI + uvicorn hiện có chạy từ `.venv`.

## Global Constraints

- Chỉ làm **Giai đoạn 1**. KHÔNG làm Nuitka, bytenode, mã hóa model, asar integrity — đó là giai đoạn 2. Xem `docs/superpowers/specs/2026-08-04-electron-migration-design.md`.
- Backend và Mongo **chỉ bind `127.0.0.1`**. Không dùng `0.0.0.0`.
- **Không** chạy Vite dev server (5173). Frontend phục vụ qua `app://` từ bản build tĩnh.
- Frontend gọi API bằng đường **relative**: `/api`→8000, `/uploads`→8000, `/fp`→8765 (strip prefix `/fp`), `/usb`→8766 (strip prefix `/usb`). WebSocket cũng đi qua các prefix này. Lớp proxy của Electron PHẢI giữ đúng mapping + rewrite như `frontend/vite.config.js` hiện tại.
- Dev escape hatch **Ctrl+Shift+Q** chỉ có trong build target `dev`, phải bị loại khỏi `prod` tại compile-time (không kiểm tra runtime).
- Toàn bộ code Electron đặt trong thư mục mới `app_cccd/electron/`. KHÔNG sửa logic backend Python. Chỉ được sửa `frontend/vite.config.js` (base path) và thêm script build.
- Mọi commit dùng tiếng Việt không dấu hoặc có dấu nhất quán với repo; kết thúc bằng dòng `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Backend hiện khởi động chậm (YOLO load model vài giây) — orchestrator phải poll `GET /api/health` (trả JSON `{ok: ...}`) tới khi sẵn sàng trước khi hiện cửa sổ chính.
- Test chạy bằng `npm test` trong `app_cccd/electron/` (Node test runner `node:test`). Các module logic phải tách khỏi Electron API để test được không cần chạy Electron.

---

## File Structure

Toàn bộ code mới nằm trong `app_cccd/electron/`. Các module logic tách khỏi Electron API để test được bằng `node:test`.

```
app_cccd/electron/
├─ package.json          # deps: electron, electron devDep; scripts start:dev / test
├─ main.js               # entry: tạo cửa sổ, ráp mọi module, xử lý app lifecycle
├─ config.js             # hằng số: port map, đường dẫn, IS_DEV flag, timeouts
├─ proxy.js              # PURE: tạo http proxy server thay Vite (route + rewrite + ws)
├─ process-manager.js    # PURE-ish: spawn/track/kill child process, restart policy
├─ health.js            # PURE: poll 1 URL tới khi ok hoặc timeout
├─ app-protocol.js       # đăng ký app:// serve frontend/dist tĩnh
├─ window.js             # tạo BrowserWindow kiosk, khóa phím, dev escape hatch
├─ splash.js             # cửa sổ splash + trang splash.html
├─ splash.html           # trang splash tĩnh trung tính
└─ test/
   ├─ proxy.test.js
   ├─ process-manager.test.js
   └─ health.test.js
```

Ranh giới trách nhiệm:
- `config.js` — nguồn sự thật duy nhất cho port/đường dẫn/flag. Mọi module khác import từ đây.
- `proxy.js` — nhận map route, trả về một `http.Server`. Không biết gì về Electron. Test được độc lập.
- `process-manager.js` — quản 1 tiến trình con: spawn, theo dõi exit, restart có giới hạn. Nhận command/args/onExit qua tham số. Logic restart test được bằng cách inject fake spawner.
- `health.js` — hàm `waitForHealthy(url, {timeoutMs, intervalMs})`. Không phụ thuộc Electron.
- `window.js`, `splash.js`, `app-protocol.js`, `main.js` — chạm Electron API, không unit-test (kiểm thủ công).

---

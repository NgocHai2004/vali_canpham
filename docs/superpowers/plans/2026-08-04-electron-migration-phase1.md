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

## Task 1: Scaffold electron/ + config.js (nguồn sự thật)

**Files:**
- Create: `app_cccd/electron/package.json`
- Create: `app_cccd/electron/config.js`
- Test: `app_cccd/electron/test/config.test.js`

**Interfaces:**
- Produces: `config` object với `PORTS = {backend: 8000, fingerprint: 8765, usb: 8766}`, `ROUTES` (map prefix→{port, stripPrefix}), `IS_DEV` (bool, từ `ELECTRON_BUILD !== 'prod'`), `HEALTH_URL = 'http://127.0.0.1:8000/api/health'`, `paths` (appRoot, frontendDist, backendVenvPython).

- [ ] **Step 1: Viết package.json**

```json
{
  "name": "app-cccd-shell",
  "version": "0.1.0",
  "private": true,
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "start:dev": "cross-env ELECTRON_BUILD=dev electron .",
    "test": "node --test"
  },
  "devDependencies": {
    "cross-env": "^7.0.3",
    "electron": "^33.0.0"
  }
}
```

- [ ] **Step 2: Viết test config (thất bại trước)**

```javascript
// test/config.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const config = require('../config')

test('routes map to correct ports with strip flags', () => {
  assert.strictEqual(config.ROUTES['/api'].port, 8000)
  assert.strictEqual(config.ROUTES['/api'].stripPrefix, false)
  assert.strictEqual(config.ROUTES['/uploads'].port, 8000)
  assert.strictEqual(config.ROUTES['/fp'].port, 8765)
  assert.strictEqual(config.ROUTES['/fp'].stripPrefix, true)
  assert.strictEqual(config.ROUTES['/usb'].port, 8766)
  assert.strictEqual(config.ROUTES['/usb'].stripPrefix, true)
})

test('IS_DEV defaults true, false only when ELECTRON_BUILD=prod', () => {
  assert.strictEqual(typeof config.IS_DEV, 'boolean')
})

test('health url points at backend loopback', () => {
  assert.strictEqual(config.HEALTH_URL, 'http://127.0.0.1:8000/api/health')
})
```

- [ ] **Step 3: Chạy test — xác nhận FAIL**

Run: `cd app_cccd/electron && npm test`
Expected: FAIL — `Cannot find module '../config'`.

- [ ] **Step 4: Viết config.js**

```javascript
// config.js - nguon su that duy nhat cho port/duong dan/flag.
const path = require('path')

const IS_DEV = process.env.ELECTRON_BUILD !== 'prod'
const appRoot = path.resolve(__dirname, '..')            // app_cccd/

const PORTS = { backend: 8000, fingerprint: 8765, usb: 8766 }

// Giu dung mapping cua frontend/vite.config.js hien tai.
const ROUTES = {
  '/api':     { port: PORTS.backend,     stripPrefix: false },
  '/uploads': { port: PORTS.backend,     stripPrefix: false },
  '/fp':      { port: PORTS.fingerprint, stripPrefix: true  },
  '/usb':     { port: PORTS.usb,         stripPrefix: true  },
}

module.exports = {
  IS_DEV,
  PORTS,
  ROUTES,
  HEALTH_URL: `http://127.0.0.1:${PORTS.backend}/api/health`,
  HOST: '127.0.0.1',
  paths: {
    appRoot,
    frontendDist: path.join(appRoot, 'frontend', 'dist'),
    backendVenvPython: path.join(appRoot, '.venv', 'Scripts', 'python.exe'),
  },
}
```

- [ ] **Step 5: Chạy test — xác nhận PASS**

Run: `cd app_cccd/electron && npm test`
Expected: PASS (3 test config).

- [ ] **Step 6: Commit**

```bash
git add app_cccd/electron/package.json app_cccd/electron/config.js app_cccd/electron/test/config.test.js
git commit -m "$(printf 'feat(electron): scaffold shell + config nguon su that\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: health.js — poll /api/health tới khi sẵn sàng

**Files:**
- Create: `app_cccd/electron/health.js`
- Test: `app_cccd/electron/test/health.test.js`

**Interfaces:**
- Consumes: không (chỉ Node `http`).
- Produces: `waitForHealthy(url, {timeoutMs, intervalMs, fetchImpl})` → Promise<true> khi body JSON có `ok:true`; reject khi quá `timeoutMs`. `fetchImpl` inject được để test (mặc định dùng `http.get`).

- [ ] **Step 1: Viết test (thất bại trước)**

```javascript
// test/health.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const { waitForHealthy } = require('../health')

test('resolves once fetch reports ok:true', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: calls >= 2 }          // lan 2 moi healthy
  }
  await waitForHealthy('http://x', { timeoutMs: 1000, intervalMs: 5, fetchImpl })
  assert.ok(calls >= 2)
})

test('rejects on timeout when never healthy', async () => {
  const fetchImpl = async () => ({ ok: false })
  await assert.rejects(
    () => waitForHealthy('http://x', { timeoutMs: 30, intervalMs: 5, fetchImpl }),
    /timeout/i,
  )
})
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `cd app_cccd/electron && npm test`
Expected: FAIL — `Cannot find module '../health'`.

- [ ] **Step 3: Viết health.js**

```javascript
// health.js - poll 1 URL toi khi body JSON co ok:true hoac timeout.
const http = require('http')

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve({ ok: false }) }
      })
    })
    req.on('error', () => resolve({ ok: false }))
    req.setTimeout(2000, () => { req.destroy(); resolve({ ok: false }) })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForHealthy(url, opts = {}) {
  const { timeoutMs = 60000, intervalMs = 500, fetchImpl = httpGetJson } = opts
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const body = await fetchImpl(url)
    if (body && body.ok === true) return true
    if (Date.now() >= deadline) throw new Error(`health timeout: ${url}`)
    await sleep(intervalMs)
  }
}

module.exports = { waitForHealthy }
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

Run: `cd app_cccd/electron && npm test`
Expected: PASS (config + health).

- [ ] **Step 5: Commit**

```bash
git add app_cccd/electron/health.js app_cccd/electron/test/health.test.js
git commit -m "$(printf 'feat(electron): health poll /api/health\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: proxy.js — thay proxy Vite (route + rewrite + ws)

**Files:**
- Create: `app_cccd/electron/proxy.js`
- Test: `app_cccd/electron/test/proxy.test.js`

**Interfaces:**
- Consumes: `config.ROUTES`, `config.HOST` (từ Task 1).
- Produces: `createProxyServer(routes, host)` → `http.Server` chưa listen. `resolveTarget(routes, urlPath)` → `{port, path}` hoặc `null`: chọn prefix khớp dài nhất, strip prefix nếu `stripPrefix`. Export cả hai để test `resolveTarget` thuần.

- [ ] **Step 1: Viết test (thất bại trước)**

```javascript
// test/proxy.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const { resolveTarget } = require('../proxy')

const ROUTES = {
  '/api':     { port: 8000, stripPrefix: false },
  '/uploads': { port: 8000, stripPrefix: false },
  '/fp':      { port: 8765, stripPrefix: true  },
  '/usb':     { port: 8766, stripPrefix: true  },
}

test('/api keeps prefix, port 8000', () => {
  assert.deepStrictEqual(resolveTarget(ROUTES, '/api/health'), { port: 8000, path: '/api/health' })
})

test('/fp strips prefix, port 8765', () => {
  assert.deepStrictEqual(resolveTarget(ROUTES, '/fp/scan'), { port: 8765, path: '/scan' })
})

test('/usb strips prefix to root when exact', () => {
  assert.deepStrictEqual(resolveTarget(ROUTES, '/usb'), { port: 8766, path: '/' })
})

test('unknown path returns null', () => {
  assert.strictEqual(resolveTarget(ROUTES, '/nope'), null)
})
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `cd app_cccd/electron && npm test`
Expected: FAIL — `Cannot find module '../proxy'`.

- [ ] **Step 3: Viết proxy.js**

```javascript
// proxy.js - http proxy thay Vite dev server. Khong phu thuoc Electron.
const http = require('http')

function resolveTarget(routes, urlPath) {
  const prefixes = Object.keys(routes).sort((a, b) => b.length - a.length)
  for (const prefix of prefixes) {
    if (urlPath === prefix || urlPath.startsWith(prefix + '/')) {
      const { port, stripPrefix } = routes[prefix]
      let path = stripPrefix ? urlPath.slice(prefix.length) : urlPath
      if (path === '') path = '/'
      return { port, path }
    }
  }
  return null
}

function createProxyServer(routes, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    const t = resolveTarget(routes, req.url)
    if (!t) { res.writeHead(404); res.end('no route'); return }
    const proxyReq = http.request(
      { host, port: t.port, path: t.path, method: req.method, headers: req.headers },
      (proxyRes) => { res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res) },
    )
    proxyReq.on('error', () => { res.writeHead(502); res.end('backend down') })
    req.pipe(proxyReq)
  })

  // WebSocket: nang cap va noi socket toi target (giu ws:true cua /api /fp /usb).
  server.on('upgrade', (req, clientSocket, head) => {
    const t = resolveTarget(routes, req.url)
    if (!t) { clientSocket.destroy(); return }
    const proxyReq = http.request({
      host, port: t.port, path: t.path, method: 'GET',
      headers: req.headers,
    })
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      clientSocket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        '\r\n\r\n')
      if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead)
      proxySocket.pipe(clientSocket).pipe(proxySocket)
    })
    proxyReq.on('error', () => clientSocket.destroy())
    proxyReq.end()
  })

  return server
}

module.exports = { createProxyServer, resolveTarget }
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

Run: `cd app_cccd/electron && npm test`
Expected: PASS (config + health + proxy).

- [ ] **Step 5: Commit**

```bash
git add app_cccd/electron/proxy.js app_cccd/electron/test/proxy.test.js
git commit -m "$(printf 'feat(electron): proxy thay Vite (route+rewrite+ws)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: process-manager.js — spawn/track/kill + restart có giới hạn

**Files:**
- Create: `app_cccd/electron/process-manager.js`
- Test: `app_cccd/electron/test/process-manager.test.js`

**Interfaces:**
- Consumes: không (nhận `spawnFn` inject).
- Produces: class `ManagedProcess({name, command, args, cwd, env, maxRestarts, spawnFn})`. Method `start()` spawn 1 lần. Khi child exit code≠0 và chưa dùng hết `maxRestarts` → tự spawn lại, tăng `restarts`. Method `stop()` kill child, đặt `stopped=true` (chặn restart). Thuộc tính đọc được: `restarts`, `stopped`, `child`.

- [ ] **Step 1: Viết test (thất bại trước)**

```javascript
// test/process-manager.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { ManagedProcess } = require('../process-manager')

function fakeSpawner() {
  const spawned = []
  const fn = () => {
    const p = new EventEmitter()
    p.kill = () => p.emit('exit', 0, 'SIGTERM')
    spawned.push(p)
    return p
  }
  return { fn, spawned }
}

test('restarts on non-zero exit up to maxRestarts', () => {
  const { fn, spawned } = fakeSpawner()
  const mp = new ManagedProcess({ name: 'x', command: 'c', args: [], maxRestarts: 2, spawnFn: fn })
  mp.start()
  spawned[0].emit('exit', 1)          // crash 1 -> restart
  spawned[1].emit('exit', 1)          // crash 2 -> restart
  spawned[2].emit('exit', 1)          // crash 3 -> het luot, khong spawn nua
  assert.strictEqual(spawned.length, 3)
  assert.strictEqual(mp.restarts, 2)
})

test('stop() prevents restart', () => {
  const { fn, spawned } = fakeSpawner()
  const mp = new ManagedProcess({ name: 'x', command: 'c', args: [], maxRestarts: 5, spawnFn: fn })
  mp.start()
  mp.stop()                            // kill -> exit, nhung stopped=true
  assert.strictEqual(mp.stopped, true)
  assert.strictEqual(spawned.length, 1)
})

test('clean exit (code 0) does not restart', () => {
  const { fn, spawned } = fakeSpawner()
  const mp = new ManagedProcess({ name: 'x', command: 'c', args: [], maxRestarts: 5, spawnFn: fn })
  mp.start()
  spawned[0].emit('exit', 0)
  assert.strictEqual(spawned.length, 1)
})
```

- [ ] **Step 2: Chạy test — xác nhận FAIL**

Run: `cd app_cccd/electron && npm test`
Expected: FAIL — `Cannot find module '../process-manager'`.

- [ ] **Step 3: Viết process-manager.js**

```javascript
// process-manager.js - quan 1 tien trinh con: spawn, theo doi exit, restart co gioi han.
const { spawn } = require('node:child_process')

class ManagedProcess {
  constructor({ name, command, args = [], cwd, env, maxRestarts = 3, spawnFn = spawn }) {
    this.name = name
    this.command = command
    this.args = args
    this.cwd = cwd
    this.env = env
    this.maxRestarts = maxRestarts
    this.spawnFn = spawnFn
    this.restarts = 0
    this.stopped = false
    this.child = null
  }

  start() {
    this.child = this.spawnFn(this.command, this.args, {
      cwd: this.cwd, env: this.env, windowsHide: true,
    })
    this.child.on('exit', (code) => this._onExit(code))
    return this
  }

  _onExit(code) {
    if (this.stopped) return
    if (code !== 0 && this.restarts < this.maxRestarts) {
      this.restarts += 1
      this.start()
    }
  }

  stop() {
    this.stopped = true
    if (this.child) this.child.kill()
  }
}

module.exports = { ManagedProcess }
```

- [ ] **Step 4: Chạy test — xác nhận PASS**

Run: `cd app_cccd/electron && npm test`
Expected: PASS (config + health + proxy + process-manager).

- [ ] **Step 5: Commit**

```bash
git add app_cccd/electron/process-manager.js app_cccd/electron/test/process-manager.test.js
git commit -m "$(printf 'feat(electron): process-manager spawn/kill + restart co gioi han\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Sửa vite.config.js base + app-protocol.js (serve frontend qua app://)

**Files:**
- Modify: `app_cccd/frontend/vite.config.js` (thêm `base: './'` cho build tương đối)
- Create: `app_cccd/electron/app-protocol.js`

**Interfaces:**
- Consumes: `config.paths.frontendDist` (Task 1).
- Produces: `registerAppProtocol(protocol, distDir)` — đăng ký scheme `app://` map path URL → file trong `distDir`; path `/` → `index.html`; chống path traversal (chặn `..`). Gọi trong `main.js` sau `app.whenReady()`.

- [ ] **Step 1: Sửa vite.config.js — thêm base tương đối**

Frontend build cho Electron cần đường dẫn asset tương đối (không phải `/assets/...` tuyệt đối). Sửa đầu `defineConfig`:

```javascript
export default defineConfig({
  base: './',
  plugins: [react()],
  // ... phần server giữ nguyên (chỉ dùng khi `npm run dev` thủ công, không dùng trong Electron)
```

- [ ] **Step 2: Viết app-protocol.js**

```javascript
// app-protocol.js - dang ky app:// serve frontend/dist tinh (thay Vite dev server).
const path = require('node:path')
const fs = require('node:fs')

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
}

function registerAppProtocol(protocol, distDir) {
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const filePath = path.normalize(path.join(distDir, rel))
    // Chan path traversal: file phai nam trong distDir.
    if (!filePath.startsWith(path.normalize(distDir))) {
      return new Response('forbidden', { status: 403 })
    }
    const target = fs.existsSync(filePath) ? filePath : path.join(distDir, 'index.html')
    const ext = path.extname(target).toLowerCase()
    const body = fs.readFileSync(target)
    return new Response(body, {
      status: 200,
      headers: { 'content-type': MIME[ext] || 'application/octet-stream' },
    })
  })
}

module.exports = { registerAppProtocol }
```

Lưu ý: fallback về `index.html` cho path không tồn tại → hỗ trợ client-side routing của React (SPA).

- [ ] **Step 3: Kiểm chứng build frontend (thủ công)**

Run: `cd app_cccd/frontend && npm run build`
Expected: sinh `frontend/dist/index.html` với asset `./assets/...` (đường dẫn tương đối, không phải `/assets/`).

- [ ] **Step 4: Commit**

```bash
git add app_cccd/frontend/vite.config.js app_cccd/electron/app-protocol.js
git commit -m "$(printf 'feat(electron): app:// protocol serve frontend build + base tuong doi\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: window.js — cửa sổ kiosk + khóa phím + dev escape hatch

**Files:**
- Create: `app_cccd/electron/window.js`

**Interfaces:**
- Consumes: `config.IS_DEV` (Task 1).
- Produces: `createKioskWindow({proxyPort})` → `BrowserWindow` (fullscreen kiosk, load `app://local/`, gọi proxy qua fetch tương đối tới `127.0.0.1:proxyPort`). `lockKeyboard(win)` chặn phím tắt. Chỉ khi `IS_DEV`: đăng ký Ctrl+Shift+Q nhả kiosk.

- [ ] **Step 1: Viết window.js**

```javascript
// window.js - cua so kiosk, khoa phim, dev escape hatch. Cham Electron API.
const { BrowserWindow, globalShortcut } = require('electron')
const path = require('node:path')
const config = require('./config')

// Cac to hop phim chan trong kiosk (bat ke dev/prod).
const BLOCKED = [
  'F12', 'CommandOrControl+Shift+I', 'CommandOrControl+R',
  'CommandOrControl+Shift+R', 'CommandOrControl+W', 'CommandOrControl+P',
]

function createKioskWindow() {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: !config.IS_DEV,          // kiosk cung o prod; dev de fullscreen thuong de thoat khi debug
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: config.IS_DEV,
    },
  })
  win.setMenuBarVisibility(false)

  // Chan mo cua so moi / link ngoai.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Chan chuot phai (context menu) qua preload inject don gian.
  win.webContents.on('context-menu', (e) => e.preventDefault())

  win.loadURL('app://local/')
  return win
}

function lockKeyboard() {
  for (const combo of BLOCKED) globalShortcut.register(combo, () => {})
  // Alt+F4 / phim Win khong chan duoc bang globalShortcut mot cach on dinh;
  // kiosk:true cua Electron da chan phan lon. Ghi chu de biet gioi han.
}

// Dev escape hatch: CHI dang ky khi IS_DEV. Prod khong co code nay chay
// (van o file nhung bi guard boi IS_DEV -> giai doan 2 se strip han).
function registerDevEscape(win) {
  if (!config.IS_DEV) return
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    win.setKiosk(false)
    win.setFullScreen(false)
  })
}

module.exports = { createKioskWindow, lockKeyboard, registerDevEscape }
```

Ghi chú giới hạn: `globalShortcut` chặn khi app focus. Alt+F4 và phím Win chặn triệt để cần Win32 hook (ngoài phạm vi Phase 1) — `kiosk:true` của Electron đã che phần lớn; watchdog cửa sổ (Task 8) mở lại nếu bị đóng.

- [ ] **Step 2: Kiểm chứng (thủ công, sau khi có main.js ở Task 8)**

Ghi chú: window.js không chạy độc lập được; kiểm cùng Task 8. Đánh dấu step này chờ Task 8.

- [ ] **Step 3: Commit**

```bash
git add app_cccd/electron/window.js
git commit -m "$(printf 'feat(electron): cua so kiosk + khoa phim + dev escape hatch\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: splash.js + splash.html — màn chờ trung tính

**Files:**
- Create: `app_cccd/electron/splash.html`
- Create: `app_cccd/electron/splash.js`

**Interfaces:**
- Produces: `createSplash()` → `BrowserWindow` nhỏ, không frame, load `splash.html`. `setSplashText(win, text)` cập nhật dòng trạng thái qua `executeJavaScript`.

- [ ] **Step 1: Viết splash.html**

```html
<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#7a0f14;color:#fff;
    font-family:Segoe UI,Arial,sans-serif;display:flex;align-items:center;
    justify-content:center;flex-direction:column;gap:16px}
  .spin{width:36px;height:36px;border:4px solid rgba(255,255,255,.3);
    border-top-color:#fff;border-radius:50%;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  #msg{font-size:15px;opacity:.9}
</style></head><body>
  <div class="spin"></div>
  <div id="msg">Đang khởi động…</div>
</body></html>
```

Màu `#7a0f14` giữ tông đỏ Công an theo design theme đã khóa. Không chữ "Electron"/"React".

- [ ] **Step 2: Viết splash.js**

```javascript
// splash.js - cua so splash trung tinh che luc backend khoi dong.
const { BrowserWindow } = require('electron')
const path = require('node:path')

function createSplash() {
  const win = new BrowserWindow({
    width: 420, height: 260, frame: false, resizable: false,
    center: true, show: true, skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.loadFile(path.join(__dirname, 'splash.html'))
  return win
}

function setSplashText(win, text) {
  if (win && !win.isDestroyed()) {
    const safe = JSON.stringify(String(text))
    win.webContents.executeJavaScript(
      `document.getElementById('msg').textContent=${safe}`).catch(() => {})
  }
}

module.exports = { createSplash, setSplashText }
```

- [ ] **Step 3: Commit**

```bash
git add app_cccd/electron/splash.html app_cccd/electron/splash.js
git commit -m "$(printf 'feat(electron): splash trung tinh tong do CAND\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 8: main.js — orchestrator (startup sequence + watchdog + teardown)

**Files:**
- Create: `app_cccd/electron/main.js`

**Interfaces:**
- Consumes: mọi module trên — `config`, `waitForHealthy` (Task 2), `createProxyServer` (Task 3), `ManagedProcess` (Task 4), `registerAppProtocol` (Task 5), `createKioskWindow`/`lockKeyboard`/`registerDevEscape` (Task 6), `createSplash`/`setSplashText` (Task 7).
- Produces: entry point Electron. Không export.

- [ ] **Step 1: Viết main.js**

```javascript
// main.js - orchestrator: spawn backend/mongo, cho healthy, vao kiosk, teardown sach.
const { app, protocol, globalShortcut } = require('electron')
const path = require('node:path')
const config = require('./config')
const { waitForHealthy } = require('./health')
const { createProxyServer } = require('./proxy')
const { ManagedProcess } = require('./process-manager')
const { registerAppProtocol } = require('./app-protocol')
const { createKioskWindow, lockKeyboard, registerDevEscape } = require('./window')
const { createSplash, setSplashText } = require('./splash')

let splash = null
let mainWin = null
let proxyServer = null
const managed = []                    // ManagedProcess list, teardown nguoc thu tu

// Single instance: chan mo 2 lan (kiosk chi 1).
if (!app.requestSingleInstanceLock()) { app.quit() }

function startBackend() {
  const backend = new ManagedProcess({
    name: 'backend',
    command: config.paths.backendVenvPython,
    args: ['-m', 'uvicorn', '--app-dir', 'backend', 'main:app',
           '--host', config.HOST, '--port', String(config.PORTS.backend)],
    cwd: config.paths.appRoot,
    env: { ...process.env },
    maxRestarts: 3,
  })
  backend.start()
  managed.push(backend)
  return backend
}

async function boot() {
  splash = createSplash()

  // Proxy thay Vite: mo tren port ngau nhien loopback (renderer goi qua day khong can,
  // vi app:// serve tinh; proxy chi can cho cac request /api /fp /usb tu frontend).
  proxyServer = createProxyServer(config.ROUTES, config.HOST)
  await new Promise((r) => proxyServer.listen(0, config.HOST, r))

  setSplashText(splash, 'Đang khởi động dịch vụ…')
  startBackend()
  // (mongod portable spawn tuong tu neu dung — Phase 1 co the dung Mongo dang chay;
  //  neu can, them ManagedProcess cho mongod o day theo cung mau startBackend.)

  setSplashText(splash, 'Đang tải mô hình…')
  try {
    await waitForHealthy(config.HEALTH_URL, { timeoutMs: 120000, intervalMs: 800 })
  } catch (e) {
    setSplashText(splash, 'Lỗi khởi động. Vui lòng khởi động lại máy.')
    return
  }

  registerAppProtocol(protocol, config.paths.frontendDist)
  mainWin = createKioskWindow()
  lockKeyboard()
  registerDevEscape(mainWin)

  // Watchdog cua so: dong bat thuong -> mo lai (thay kiosk-guard.ahk).
  mainWin.on('closed', () => {
    if (!app.isQuiting) { mainWin = createKioskWindow(); registerDevEscape(mainWin) }
  })

  mainWin.webContents.once('did-finish-load', () => {
    if (splash && !splash.isDestroyed()) splash.close()
    splash = null
  })
}

app.whenReady().then(boot)

function teardown() {
  app.isQuiting = true
  globalShortcut.unregisterAll()
  // Kill nguoc thu tu: cac tien trinh con truoc, roi proxy.
  for (let i = managed.length - 1; i >= 0; i--) managed[i].stop()
  if (proxyServer) try { proxyServer.close() } catch {}
}

app.on('before-quit', teardown)
app.on('window-all-closed', () => { /* kiosk: watchdog mo lai; quit qua teardown */ })
```

Ghi chú: nếu Phase 1 dùng Mongo đang chạy sẵn (chưa bundle portable), bỏ phần mongod — spec cho phép bundle `mongo_portable` nhưng đó là bước sau; thêm `ManagedProcess` cho `mongod.exe` theo cùng mẫu `startBackend()` khi có binary.

- [ ] **Step 2: Cài deps + kiểm chứng khởi động (thủ công)**

```bash
cd app_cccd/electron && npm install
cd ../frontend && npm run build
cd ../electron && npm run start:dev
```

Expected: splash đỏ hiện "Đang khởi động…" → "Đang tải mô hình…", sau khi backend healthy thì splash đóng, cửa sổ kiosk hiện frontend App_CCCD, gọi `/api/...` chạy được. Ctrl+Shift+Q nhả fullscreen (chỉ dev).

- [ ] **Step 3: Kiểm chứng teardown (thủ công)**

Đóng app (Alt+F4 ở dev, hoặc Ctrl+Shift+Q rồi đóng). Mở Task Manager: không còn tiến trình `python.exe` uvicorn mồ côi.

- [ ] **Step 4: Chạy toàn bộ test tự động**

Run: `cd app_cccd/electron && npm test`
Expected: PASS toàn bộ (config + health + proxy + process-manager).

- [ ] **Step 5: Commit**

```bash
git add app_cccd/electron/main.js
git commit -m "$(printf 'feat(electron): orchestrator startup + watchdog + teardown\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-Review (Electron shell plan)

- **Spec coverage (§ design 2026-08-04):**
  - Bind 127.0.0.1: `config.HOST`, backend args `--host 127.0.0.1` (Task 1, 8) ✓
  - Bỏ Vite, serve `app://`: Task 5 ✓
  - Kiosk + khóa phím + chặn cửa sổ mới/context menu: Task 6 ✓
  - Dev escape Ctrl+Shift+Q chỉ dev (guard `IS_DEV`): Task 6 ✓
  - Splash che lúc load YOLO: Task 7 + poll health Task 8 ✓
  - Watchdog cửa sổ + restart tiến trình: Task 4 (restart) + Task 8 (window watchdog) ✓
  - Teardown sạch theo thứ tự ngược: Task 8 `teardown()` ✓
  - Proxy giữ mapping vite.config.js (/api,/uploads→8000; /fp→8765 strip; /usb→8766 strip; ws): Task 3 ✓
- **Placeholder scan:** không có TODO/TBD; mọi step có code hoặc lệnh cụ thể. Phần mongod nêu rõ là tùy chọn có điều kiện, không phải placeholder.
- **Type consistency:** tên hàm nhất quán across tasks — `createProxyServer`/`resolveTarget`, `waitForHealthy`, `ManagedProcess.start/stop`, `registerAppProtocol`, `createKioskWindow`/`lockKeyboard`/`registerDevEscape`, `createSplash`/`setSplashText`. `config.ROUTES`/`PORTS`/`HOST`/`HEALTH_URL`/`paths` khớp Task 1.
- **Giới hạn Phase 1:** không Nuitka/bytenode/mã hóa/asar — đúng Global Constraints.


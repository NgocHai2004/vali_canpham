// main.js - orchestrator: spawn backend/mongo, cho healthy, vao kiosk, teardown sach.
const { app, protocol, globalShortcut } = require('electron')
const config = require('./config')
const { waitForHealthy } = require('./health')
const { createProxyServer } = require('./proxy')
const { ManagedProcess } = require('./process-manager')
const { registerAppProtocol } = require('./app-protocol')
const { createKioskWindow, lockKeyboard, registerDevEscape, registerKioskEscape } = require('./window')
const { createPreviewWindow } = require('./preview-window')
const { createSplash, setSplashText } = require('./splash')

// Custom scheme phai dang ky dac quyen TRUOC app.whenReady() moi serve duoc.
// Khong dung 'app' (Electron dan rieng). 'appcccd' la scheme rieng cua minh.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'appcccd',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

function registerAppScheme() {
  registerAppProtocol(protocol, config.paths.frontendDist, config.HOST, proxyServer.address().port)
}

let splash = null
let mainWin = null
let previewWin = null
let proxyServer = null
const managed = []                    // ManagedProcess list, teardown nguoc thu tu

// Single instance: chan mo 2 lan (kiosk chi 1).
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.show()
      mainWin.focus()
    }
  })
}

// Kiem tra backend da chay tu truoc (port 8000) chua. Neu roi thi KHONG spawn lai
// (tranh trung port) — chi doi healthy. Cho phep run-electron.ps1 start backend rieng.
const net = require('node:net')

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port })
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('error', () => resolve(false))
    setTimeout(() => { sock.destroy(); resolve(false) }, 300)
  })
}

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

  // Proxy thay Vite: phuc vu /api, /uploads, /fp, /usb cho frontend build.
  proxyServer = createProxyServer(config.ROUTES, config.HOST)
  await new Promise((r) => proxyServer.listen(0, config.HOST, r))

  setSplashText(splash, 'Đang khởi động dịch vụ…')
  // Neu backend da chay tu truoc (run-electron.ps1 start rieng) thi KHONG spawn lai.
  const backendAlreadyUp = await isPortOpen(config.HOST, config.PORTS.backend)
  if (backendAlreadyUp) {
    console.log('[boot] backend da chay tu truoc — bo qua spawn, chi doi healthy.')
  } else {
    startBackend()
  }
  // mongod portable: bundle trong giai doan 2 (hoac dung Mongo dang chay). Neu
  // can, them ManagedProcess cho mongod.exe theo cung mau startBackend().

  setSplashText(splash, 'Đang tải mô hình…')
  try {
    await waitForHealthy(config.HEALTH_URL, { timeoutMs: 120000, intervalMs: 800 })  } catch (e) {
    setSplashText(splash, 'Lỗi khởi động. Vui lòng khởi động lại máy.')
    return
  }

  registerAppScheme()
  const proxyPort = proxyServer.address().port
  mainWin = createKioskWindow(proxyPort)
  lockKeyboard()
  registerDevEscape(mainWin)

  // Man phu (xem truoc ho so): chi mo khi co >= 2 display.
  previewWin = createPreviewWindow(proxyPort, mainWin)

  // Watchdog cua so: dong bat thuong -> mo lai (thay kiosk-guard.ahk).
  mainWin.on('closed', () => {
    if (!app.isQuiting) {
      mainWin = createKioskWindow(proxyPort)
      registerDevEscape(mainWin)
    }
  })

  // Watchdog cua so phu: dong bat thuong -> mo lai.
  if (previewWin) {
    previewWin.on('closed', () => {
      if (!app.isQuiting) {
        previewWin = createPreviewWindow(proxyPort, mainWin)
      }
    })
  }

  mainWin.webContents.once('did-finish-load', () => {
    if (splash && !splash.isDestroyed()) splash.close()
    splash = null
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.show()
      mainWin.focus()
    }
  })
}

app.whenReady().then(() => {
  // Escape toan he thong (Ctrl+Q) dang ky TRUOC boot: co escape ca khi boot loi
  // (splash bao loi) de ve desktop (kiosk-shell.ps1 mo Explorer). Escape chi co
  // sau whenReady; cua so splash chua co input, luon co kha nang Ctrl+Alt+Del.
  registerKioskEscape()
  boot()
})

function teardown() {
  app.isQuiting = true
  globalShortcut.unregisterAll()
  // Dong cua so phu truoc, roi kill tien trinh con, roi proxy.
  if (previewWin && !previewWin.isDestroyed()) try { previewWin.destroy() } catch {}
  // Kill nguoc thu tu: cac tien trinh con truoc, roi proxy.
  for (let i = managed.length - 1; i >= 0; i--) managed[i].stop()
  if (proxyServer) try { proxyServer.close() } catch {}
}

app.on('before-quit', teardown)
// Kiosk: watchdog mo lai cua so khi dong; quit qua teardown/Alt+F4 dev.
app.on('window-all-closed', () => {})
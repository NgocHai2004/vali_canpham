// window.js - cua so kiosk, khoa phim, dev/prod escape hatch. Cham Electron API.
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron')
const path = require('node:path')
const config = require('./config')

// Cac to hop phim chan trong kiosk (bat ke dev/prod).
const BLOCKED = [
  'F12', 'CommandOrControl+Shift+I', 'CommandOrControl+R',
  'CommandOrControl+Shift+R', 'CommandOrControl+W', 'CommandOrControl+P',
]

function createKioskWindow(proxyPort) {
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: !config.IS_DEV,
    frame: false,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: config.IS_DEV,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  win.setMenuBarVisibility(false)
  win.show()
  win.focus()

  // Chan mo cua so moi / link ngoai.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Chan chuot phai (context menu).
  win.webContents.on('context-menu', (e) => e.preventDefault())

  // Gui proxyPort vao renderer ngay khi dom ready (preload lang nghe 'set-proxy-port').
  win.webContents.once('dom-ready', () => {
    if (proxyPort) win.webContents.send('set-proxy-port', proxyPort)
  })

  win.loadURL('appcccd://local/')
  return win
}

function lockKeyboard() {
  for (const combo of BLOCKED) globalShortcut.register(combo, () => {})
  // Alt+F4 / phim Win chuan triet de can Win32 hook (ngoai pham vi Phase 1);
  // kiosk:true cua Electron da chan phan lon. Watchdog cua so se mo lai neu dong.
}

// Escape toan he thong (prod + dev): Ctrl+Q thoat app -> kiosk-shell.ps1 (shell
// thay the) thay Explorer mo lai desktop de sua. Dang ky ngay khi app ready
// (goi truoc boot()) de co escape ca khi boot loi / splash dang chieu.
function registerKioskEscape() {
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })
}

// Dev escape hatch: CHI dang ky khi IS_DEV. Prod khong chay nhanh nay
// (guard boi IS_DEV; giai doan 2 se strip han).
function registerDevEscape(win) {
  if (!config.IS_DEV) return
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    win.setKiosk(false)
    win.setFullScreen(false)
  })
}

module.exports = { createKioskWindow, lockKeyboard, registerDevEscape, registerKioskEscape }
// preview-window.js - cua so phu (man hinh 2) cho xem truoc ho so A4.
// Chi mo khi co >= 2 display. Load appcccd://local/?preview=1 -> PreviewWindow (trang).
const { BrowserWindow, screen } = require('electron')
const path = require('node:path')
const config = require('./config')

// Tim display phu (khong phai display chua cua so chinh).
function findSecondaryDisplay(primaryWin) {
  const displays = screen.getAllDisplays()
  if (displays.length < 2) return null
  // Display phai la display khac display cua cua so chinh.
  const primaryBounds = primaryWin ? primaryWin.getBounds() : displays[0].bounds
  const primary = primaryWin
    ? screen.getDisplayMatching(primaryBounds)
    : displays[0]
  const secondary = displays.find((d) => d.id !== primary.id)
  return secondary || null
}

function createPreviewWindow(proxyPort, primaryWin) {
  const secondary = findSecondaryDisplay(primaryWin)
  console.log(`[preview] displays=${screen.getAllDisplays().length} secondary=${secondary ? `${secondary.bounds.x},${secondary.bounds.y} ${secondary.bounds.width}x${secondary.bounds.height}` : 'none'}`)
  if (!secondary) return null

  const { x, y, width, height } = secondary.bounds
  const win = new BrowserWindow({
    x, y, width, height,
    fullscreen: true,
    kiosk: !config.IS_DEV,
    frame: false,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  win.setMenuBarVisibility(false)
  win.show()
  win.focus()
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Gui proxyPort cho preload (USB export can goi /usb qua proxy).
  win.webContents.once('dom-ready', () => {
    if (proxyPort) win.webContents.send('set-proxy-port', proxyPort)
  })

  // Route ?preview=1 -> main.jsx render PreviewWindow (trang, cho BroadcastChannel).
  win.loadURL('appcccd://local/?preview=1')
  return win
}

module.exports = { createPreviewWindow, findSecondaryDisplay }
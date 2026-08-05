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
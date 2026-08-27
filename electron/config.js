// config.js - nguon su that duy nhat cho port/duong dan/flag.
const path = require('path')

// Khi dong goi, code nam trong resources/app.asar -> __dirname chua 'app.asar'.
// Khong require('electron') o day: config.test.js chay ngoai Electron.
const IS_PACKAGED = __dirname.includes('app.asar')

// Ban dong goi = prod (kiosk that). Van cho override bang ELECTRON_BUILD=dev
// de test ban da dong goi ma khong bi khoa trong kiosk.
const IS_DEV = IS_PACKAGED
  ? process.env.ELECTRON_BUILD === 'dev'
  : process.env.ELECTRON_BUILD !== 'prod'

// Dev:  app_cccd/            (electron/.. )
// Prod: thu muc chua .exe    (resources/.. )
const appRoot = IS_PACKAGED
  ? path.dirname(process.resourcesPath)
  : path.resolve(__dirname, '..')

const PORTS = { backend: 8000, fingerprint: 8765, usb: 8766 }

// Giu dung mapping cua frontend/vite.config.js hien tai.
const ROUTES = {
  '/api':     { port: PORTS.backend,     stripPrefix: false },
  '/uploads': { port: PORTS.backend,     stripPrefix: false },
  '/fp':      { port: PORTS.fingerprint, stripPrefix: true  },
  '/usb':     { port: PORTS.usb,         stripPrefix: true  },
}

// Prod: frontend build nam trong asar (electron/webdist -> app.asar/webdist).
// Dev:  doc truc tiep frontend/dist nhu cu.
const frontendDist = IS_PACKAGED
  ? path.join(__dirname, 'webdist')
  : path.join(appRoot, 'frontend', 'dist')

// Prod: Python portable di kem (runtime/python). Dev: .venv nhu cu.
const backendVenvPython = IS_PACKAGED
  ? path.join(appRoot, 'runtime', 'python', 'python.exe')
  : path.join(appRoot, '.venv', 'Scripts', 'python.exe')

// Prod: backend/ nam canh .exe. Dev: app_cccd/backend.
const backendDir = path.join(appRoot, 'backend')

module.exports = {
  IS_DEV,
  IS_PACKAGED,
  PORTS,
  ROUTES,
  HEALTH_URL: `http://127.0.0.1:${PORTS.backend}/api/health`,
  HOST: '127.0.0.1',
  paths: {
    appRoot,
    backendDir,
    frontendDist,
    backendVenvPython,
  },
}

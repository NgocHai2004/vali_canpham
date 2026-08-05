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

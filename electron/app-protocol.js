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
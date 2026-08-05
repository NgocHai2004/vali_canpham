// app-protocol.js - dang ky app:// serve frontend/dist tinh (thay Vite dev server).
// Path thuoc cacs prefix API (/api /uploads /fp /usb) duoc forward sang proxy
// de goi backend — vi frontend build goi API bang duong tuong doi (/api/...),
// va khi load qua app:// cac duong do se roi vao handler nay thay vi proxy.
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
}

const API_PREFIXES = ['/api', '/uploads', '/fp', '/usb']

function isApiPath(relPath) {
  return API_PREFIXES.some((p) => relPath === p || relPath.startsWith(p + '/'))
}

// Forward 1 request toi proxy (127.0.0.1:proxyPort) va tra ve Response.
function proxyRequest(proxyHost, proxyPort, relPath, originalReq) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: proxyHost, port: proxyPort, path: relPath, method: originalReq.method,
        headers: originalReq.headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve(new Response(Buffer.concat(chunks), {
            status: res.statusCode,
            headers: res.headers,
          }))
        })
      },
    )
    req.on('error', () => resolve(new Response('proxy error', { status: 502 })))
    if (originalReq.body) req.write(originalReq.body)
    req.end()
  })
}

function registerAppProtocol(protocol, distDir, proxyHost, proxyPort) {
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'

    // Cac duong API -> proxy backend.
    if (isApiPath(rel)) {
      return proxyRequest(proxyHost, proxyPort, rel, request)
    }

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
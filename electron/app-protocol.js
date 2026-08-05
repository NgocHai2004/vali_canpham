// app-protocol.js - dang ky appcccd:// serve frontend/dist tinh (thay Vite dev server).
// Ten scheme la 'appcccd' (KHONG dung 'app' — Electron danh rieng app:// noi bo).
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

// Lay headers tu web Request (Headers object — phai dung .get(), khong enumerate).
function collectHeaders(reqHeaders, bodyBuffer) {
  const headers = {}
  const PRESERVED = [
    'authorization', 'content-type', 'content-length', 'accept', 'accept-language',
    'cookie', 'user-agent', 'x-requested-with',
  ]
  for (const name of PRESERVED) {
    const v = reqHeaders.get(name)
    if (v != null) headers[name] = v
  }
  // Suy Content-Type tu body neu van thieu (form-encoded vs json).
  if (!headers['content-type'] && bodyBuffer && bodyBuffer.length) {
    const t = bodyBuffer.toString('utf8')
    if (/^[^=]+=[^&]*(&[^=]+=[^&]*)*$/.test(t) && !t.trim().startsWith('{')) {
      headers['content-type'] = 'application/x-www-form-urlencoded'
    } else {
      headers['content-type'] = 'application/json'
    }
  }
  if (bodyBuffer) headers['content-length'] = String(bodyBuffer.length)
  return headers
}

// Forward 1 request toi proxy (127.0.0.1:proxyPort) va tra ve Response.
async function proxyRequest(proxyHost, proxyPort, relPath, originalReq) {
  // request.body la ReadableStream (web stream) — phai doc het ra buffer.
  let bodyBuffer = null
  if (originalReq.body) {
    const reader = originalReq.body.getReader()
    const parts = []
    let totalLen = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      totalLen += value.length
    }
    bodyBuffer = Buffer.concat(parts, totalLen)
  }

  const headers = collectHeaders(originalReq.headers, bodyBuffer)

  console.log(`[proxy] forward ${originalReq.method} ${relPath} ct=${headers['content-type'] || '-'} authz=${headers['authorization'] ? 'yes' : 'no'}`)

  return new Promise((resolve) => {
    const req = http.request(
      { host: proxyHost, port: proxyPort, path: relPath, method: originalReq.method,
        headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          console.log(`[proxy] <- ${res.statusCode} ${relPath} respLen=${buf.length}`)
          resolve(new Response(buf, {
            status: res.statusCode,
            headers: res.headers,
          }))
        })
      },
    )
    req.on('error', (e) => {
      console.log(`[proxy] ERROR ${relPath}: ${e.message}`)
      resolve(new Response('proxy error', { status: 502 }))
    })
    if (bodyBuffer) req.write(bodyBuffer)
    req.end()
  })
}

function registerAppProtocol(protocol, distDir, proxyHost, proxyPort) {
  protocol.handle('appcccd', async (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'

    // Cac duong API -> proxy backend.
    if (isApiPath(rel)) {
      return await proxyRequest(proxyHost, proxyPort, rel, request)
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
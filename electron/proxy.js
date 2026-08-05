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
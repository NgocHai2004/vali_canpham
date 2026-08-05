// preload.js - chay trong renderer truoc page load. Chi nhan 1 bien tu main.
const { contextBridge, ipcRenderer } = require('electron')

// main gui proxyPort qua 'set-proxy-port' khi cua so san sang.
let proxyPort = null
ipcRenderer.on('set-proxy-port', (_e, port) => {
  proxyPort = port
  // cap nhat lai tren window cho code chay sau nay.
  window.__APPCCCD_PROXY_PORT__ = port
})

contextBridge.exposeInMainWorld('appcccd', {
  getProxyPort: () => proxyPort,
  // host luon la loopback (backend + proxy chi bind 127.0.0.1).
  proxyHost: '127.0.0.1',
})

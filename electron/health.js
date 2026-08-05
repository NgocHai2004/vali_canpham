// health.js - poll 1 URL toi khi body JSON co ok:true hoac timeout.
const http = require('http')

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve({ ok: false }) }
      })
    })
    req.on('error', () => resolve({ ok: false }))
    req.setTimeout(2000, () => { req.destroy(); resolve({ ok: false }) })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForHealthy(url, opts = {}) {
  const { timeoutMs = 60000, intervalMs = 500, fetchImpl = httpGetJson } = opts
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const body = await fetchImpl(url)
    if (body && body.ok === true) return true
    if (Date.now() >= deadline) throw new Error(`health timeout: ${url}`)
    await sleep(intervalMs)
  }
}

module.exports = { waitForHealthy }

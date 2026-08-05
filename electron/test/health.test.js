// test/health.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const { waitForHealthy } = require('../health')

test('resolves once fetch reports ok:true', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return { ok: calls >= 2 }          // lan 2 moi healthy
  }
  await waitForHealthy('http://x', { timeoutMs: 1000, intervalMs: 5, fetchImpl })
  assert.ok(calls >= 2)
})

test('rejects on timeout when never healthy', async () => {
  const fetchImpl = async () => ({ ok: false })
  await assert.rejects(
    () => waitForHealthy('http://x', { timeoutMs: 30, intervalMs: 5, fetchImpl }),
    /timeout/i,
  )
})

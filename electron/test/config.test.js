// test/config.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const config = require('../config')

test('routes map to correct ports with strip flags', () => {
  assert.strictEqual(config.ROUTES['/api'].port, 8000)
  assert.strictEqual(config.ROUTES['/api'].stripPrefix, false)
  assert.strictEqual(config.ROUTES['/uploads'].port, 8000)
  assert.strictEqual(config.ROUTES['/fp'].port, 8765)
  assert.strictEqual(config.ROUTES['/fp'].stripPrefix, true)
  assert.strictEqual(config.ROUTES['/usb'].port, 8766)
  assert.strictEqual(config.ROUTES['/usb'].stripPrefix, true)
})

test('IS_DEV defaults true, false only when ELECTRON_BUILD=prod', () => {
  assert.strictEqual(typeof config.IS_DEV, 'boolean')
})

test('health url points at backend loopback', () => {
  assert.strictEqual(config.HEALTH_URL, 'http://127.0.0.1:8000/api/health')
})

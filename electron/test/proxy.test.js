// test/proxy.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const { resolveTarget } = require('../proxy')

const ROUTES = {
  '/api':     { port: 8000, stripPrefix: false },
  '/uploads': { port: 8000, stripPrefix: false },
  '/fp':      { port: 8765, stripPrefix: true  },
  '/usb':     { port: 8766, stripPrefix: true  },
}

test('/api keeps prefix, port 8000', () => {
  assert.deepStrictEqual(resolveTarget(ROUTES, '/api/health'), { port: 8000, path: '/api/health' })
})

test('/fp strips prefix, port 8765', () => {
  assert.deepStrictEqual(resolveTarget(ROUTES, '/fp/scan'), { port: 8765, path: '/scan' })
})

test('/usb strips prefix to root when exact', () => {
  assert.deepStrictEqual(resolveTarget(ROUTES, '/usb'), { port: 8766, path: '/' })
})

test('unknown path returns null', () => {
  assert.strictEqual(resolveTarget(ROUTES, '/nope'), null)
})
// test/process-manager.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const { EventEmitter } = require('node:events')
const { ManagedProcess } = require('../process-manager')

function fakeSpawner() {
  const spawned = []
  const fn = () => {
    const p = new EventEmitter()
    p.kill = () => p.emit('exit', 0, 'SIGTERM')
    spawned.push(p)
    return p
  }
  return { fn, spawned }
}

test('restarts on non-zero exit up to maxRestarts', () => {
  const { fn, spawned } = fakeSpawner()
  const mp = new ManagedProcess({ name: 'x', command: 'c', args: [], maxRestarts: 2, spawnFn: fn })
  mp.start()
  spawned[0].emit('exit', 1)
  spawned[1].emit('exit', 1)
  spawned[2].emit('exit', 1)
  assert.strictEqual(spawned.length, 3)
  assert.strictEqual(mp.restarts, 2)
})

test('stop() prevents restart', () => {
  const { fn, spawned } = fakeSpawner()
  const mp = new ManagedProcess({ name: 'x', command: 'c', args: [], maxRestarts: 5, spawnFn: fn })
  mp.start()
  mp.stop()
  assert.strictEqual(mp.stopped, true)
  assert.strictEqual(spawned.length, 1)
})

test('clean exit (code 0) does not restart', () => {
  const { fn, spawned } = fakeSpawner()
  const mp = new ManagedProcess({ name: 'x', command: 'c', args: [], maxRestarts: 5, spawnFn: fn })
  mp.start()
  spawned[0].emit('exit', 0)
  assert.strictEqual(spawned.length, 1)
})
// process-manager.js - quan 1 tien trinh con: spawn, theo doi exit, restart co gioi han.
const { spawn } = require('node:child_process')

class ManagedProcess {
  constructor({ name, command, args = [], cwd, env, maxRestarts = 3, spawnFn = spawn }) {
    this.name = name
    this.command = command
    this.args = args
    this.cwd = cwd
    this.env = env
    this.maxRestarts = maxRestarts
    this.spawnFn = spawnFn
    this.restarts = 0
    this.stopped = false
    this.child = null
  }

  start() {
    this.child = this.spawnFn(this.command, this.args, {
      cwd: this.cwd, env: this.env, windowsHide: true,
    })
    this.child.on('exit', (code) => this._onExit(code))
    return this
  }

  _onExit(code) {
    if (this.stopped) return
    if (code !== 0 && this.restarts < this.maxRestarts) {
      this.restarts += 1
      this.start()
    }
  }

  stop() {
    this.stopped = true
    if (this.child) this.child.kill()
  }
}

module.exports = { ManagedProcess }
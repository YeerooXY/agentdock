'use strict';
const { performance } = require('node:perf_hooks');
const KINDS = new Set(['main-loop', 'input-roundtrip', 'terminal-write']);
// Timing metadata only: never log keystrokes, terminal output or commands.
class Responsiveness {
  constructor({ log, now = () => performance.now(), schedule = setInterval, cancel = clearInterval }) {
    Object.assign(this, { log, now, cancel }); this.last = now(); this.reported = new Map();
    this.timer = schedule(() => { const at = now(), delay = at - this.last - 1000; this.last = at; this.report({ kind: 'main-loop', durationMs: delay }); }, 1000);
    this.timer.unref?.();
  }
  report(value) {
    if (!KINDS.has(value?.kind) || !Number.isFinite(value?.durationMs)) return;
    const { kind, durationMs } = value;
    if (durationMs < 500 || durationMs > 120000 || this.now() - (this.reported.get(kind) ?? -Infinity) < 10000) return;
    this.reported.set(kind, this.now()); this.log(`Responsiveness: ${kind} stalled ${Math.round(durationMs)} ms`);
  }
  dispose() { this.cancel(this.timer); }
}
module.exports = { Responsiveness };

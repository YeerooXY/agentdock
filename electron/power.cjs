'use strict';

// One request covers all active work. It allows display sleep and never changes
// the user's power plan. Window visibility has no bearing on the request.
// Plain shells and custom commands report no agent status; they count as working
// while they have printed output recently, such as a running build.
const SHELL_QUIET_MS = 5 * 60 * 1000;
class WorkPower {
  constructor(blocker) { this.blocker = blocker; this.id = null; this.closed = false; }
  update({ enabled, sessions = [], apiBusy = false, now = Date.now() }) {
    const busyShell = x => ['shell', 'custom'].includes(x.provider) && x.lastOutputAt && now - x.lastOutputAt < SHELL_QUIET_MS;
    const working = apiBusy || sessions.some(x => x.alive && !x.dismissed && (x.state === 'active' || busyShell(x)));
    if (enabled && working && !this.closed) {
      if (this.id === null) this.id = this.blocker.start('prevent-app-suspension');
    } else this.release();
  }
  release() {
    if (this.id === null) return;
    this.blocker.stop(this.id); this.id = null;
  }
  dispose() { this.closed = true; this.release(); }
}

module.exports = { WorkPower, SHELL_QUIET_MS };

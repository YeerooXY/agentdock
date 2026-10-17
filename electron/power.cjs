'use strict';

// One request covers all active work. It allows display sleep and never changes
// the user's Windows power plan. Window visibility has no bearing on the request.
class WorkPower {
  constructor(blocker) { this.blocker = blocker; this.id = null; this.closed = false; }
  update({ enabled, sessions = [], apiBusy = false }) {
    const working = apiBusy || sessions.some(x => x.alive && !x.dismissed && x.state === 'active');
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

module.exports = { WorkPower };

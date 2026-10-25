'use strict';
const { Terminal } = require('@xterm/headless');
const { SerializeAddon } = require('@xterm/addon-serialize');
// A phone that connects mid-answer gets the whole answer, not only the last screens.
const CHECKPOINT_LINES = 2000;
// The parser keeps a real screen checkpoint. Reconnects never start in a cut ANSI sequence.
class TerminalStream {
  constructor(session, epoch = 1) {
    this.term = new Terminal({ allowProposedApi: true, cols: session.cols || 110, rows: session.rows || 30, scrollback: 3000 });
    this.serializer = new SerializeAddon(); this.term.loadAddon(this.serializer);
    this.history = []; this.bytes = 0; this.sequence = session.sequence || 0; this.epoch = epoch; this.launchId = session.launchId || null;
    this.cols = this.term.cols; this.rows = this.term.rows;
    this.ready = new Promise(resolve => this.term.write(session.buffer || '', resolve));
  }
  write(packet) {
    const current = this.ready.then(() => {
      // The owner replaces a stream from the authoritative session snapshot
      // when a launch changes. A late packet from the old PTY cannot reset it.
      if (packet.launchId && packet.launchId !== this.launchId) return;
      if (packet.reset) {
        this.term.reset(); this.history = []; this.bytes = 0; this.sequence = 0; this.epoch++;
      }
      if (!packet.reset && Number.isFinite(packet.sequence) && packet.sequence <= this.sequence) return;
      const copy = { sequence: packet.sequence, data: packet.data || '' };
      this.history.push(copy); this.bytes += Buffer.byteLength(copy.data);
      while (this.bytes > 1024 * 1024 || this.history.length > 2000) this.bytes -= Buffer.byteLength(this.history.shift().data);
      return new Promise(resolve => this.term.write(copy.data, () => { this.sequence = copy.sequence; resolve(); }));
    });
    this.ready = current.catch(() => {});
    return current;
  }
  resize(cols, rows) {
    const current = this.ready.then(() => {
      if (cols === this.cols && rows === this.rows) return;
      this.cols = cols; this.rows = rows; this.term.resize(cols, rows); this.epoch++;
    });
    this.ready = current.catch(() => {});
    return current;
  }
  read(sequence, epoch) {
    // Snapshot dimensions, parser state and epoch in the same ordered queue.
    const frame = this.ready.then(() => {
      const available = this.history.filter(x => x.sequence > sequence && x.sequence <= this.sequence);
      if (epoch === this.epoch && sequence <= this.sequence && (sequence === this.sequence || available[0]?.sequence === sequence + 1)) return { sequence: this.sequence, epoch: this.epoch, data: available.map(x => x.data).join(''), reset: false, cols: this.term.cols, rows: this.term.rows };
      return { sequence: this.sequence, epoch: this.epoch, data: this.serializer.serialize({ scrollback: CHECKPOINT_LINES }), reset: true, cols: this.term.cols, rows: this.term.rows };
    });
    this.ready = frame.then(() => {});
    return frame;
  }
  dispose() { this.ready.finally(() => this.term.dispose()); }
}
module.exports = { TerminalStream, CHECKPOINT_LINES };

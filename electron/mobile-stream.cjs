'use strict';
const { Terminal } = require('@xterm/headless');
const { SerializeAddon } = require('@xterm/addon-serialize');
// The parser keeps a real screen checkpoint. Reconnects never start in a cut ANSI sequence.
class TerminalStream {
  constructor(session) {
    this.term = new Terminal({ allowProposedApi: true, cols: session.cols || 110, rows: session.rows || 30, scrollback: 500 });
    this.serializer = new SerializeAddon(); this.term.loadAddon(this.serializer);
    this.history = []; this.bytes = 0; this.sequence = session.sequence || 0; this.epoch = 1;
    this.cols = this.term.cols; this.rows = this.term.rows;
    this.ready = new Promise(resolve => this.term.write(session.buffer || '', resolve));
  }
  write(packet) {
    const copy = { sequence: packet.sequence, data: packet.data };
    this.history.push(copy); this.bytes += Buffer.byteLength(copy.data);
    while (this.bytes > 1024 * 1024 || this.history.length > 2000) this.bytes -= Buffer.byteLength(this.history.shift().data);
    this.ready = this.ready.then(() => new Promise(resolve => this.term.write(copy.data, () => { this.sequence = copy.sequence; resolve(); })));
  }
  resize(cols, rows) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols; this.rows = rows;
    this.ready = this.ready.then(() => { this.term.resize(cols, rows); this.epoch++; });
  }
  read(sequence, epoch) {
    // Snapshot dimensions, parser state and epoch in the same ordered queue.
    const frame = this.ready.then(() => {
      const available = this.history.filter(x => x.sequence > sequence && x.sequence <= this.sequence);
      if (epoch === this.epoch && sequence <= this.sequence && (sequence === this.sequence || available[0]?.sequence === sequence + 1)) return { sequence: this.sequence, epoch: this.epoch, data: available.map(x => x.data).join(''), reset: false, cols: this.term.cols, rows: this.term.rows };
      return { sequence: this.sequence, epoch: this.epoch, data: this.serializer.serialize({ scrollback: 100 }), reset: true, cols: this.term.cols, rows: this.term.rows };
    });
    this.ready = frame.then(() => {});
    return frame;
  }
  dispose() { this.ready.finally(() => this.term.dispose()); }
}
module.exports = { TerminalStream };

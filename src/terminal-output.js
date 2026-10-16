// Keep short hide/redraw/show bursts in one write. ConPTY can split the show
// command into a later packet; painting the hidden intermediate state flickers.
// A bounded grace period preserves applications that intentionally hide cursors.
export function terminalOutput(write, afterWrite) {
  let chunks = [], size = 0, timer, disposed = false, grace = false, hidePending = false;
  let mode = 'text', sequence = '', stringEscape = false;
  function scan(data) {
    for (const char of data) {
      if (mode === 'string') {
        if (char === '\x07' || char === '\x9c' || (stringEscape && char === '\\')) mode = 'text';
        stringEscape = char === '\x1b'; continue;
      }
      if (mode === 'escape') {
        mode = char === '[' ? 'csi' : ']PX^_'.includes(char) ? 'string' : 'text';
        sequence = ''; stringEscape = false;
        if (char === 'c') hidePending = false;
        continue;
      }
      if (char === '\x1b') { mode = 'escape'; continue; }
      if (char === '\x9b') { mode = 'csi'; sequence = ''; continue; }
      if (mode !== 'csi') continue;
      if (char >= '@' && char <= '~') {
        if ((char === 'h' || char === 'l') && /^\?[\d;]+$/.test(sequence) && sequence.slice(1).split(';').includes('25')) hidePending = char === 'l';
        mode = 'text'; sequence = '';
      } else if (sequence.length < 128) sequence += char;
      else { mode = 'text'; sequence = ''; }
    }
  }
  function flush() {
    clearTimeout(timer); timer = undefined;
    if (disposed || !chunks.length) return;
    const data = chunks.join(''); chunks = []; size = 0;
    grace = false; hidePending = false;
    write(data, afterWrite);
  }
  function scheduledFlush() {
    if (!grace && (hidePending || mode === 'escape' || mode === 'csi')) {
      grace = true; timer = setTimeout(flush, 32); return;
    }
    flush();
  }
  return {
    push(data) {
      if (disposed || !data) return;
      chunks.push(data); size += data.length; scan(data);
      if (size >= 65536) flush();
      else if (grace && !hidePending && mode === 'text') { clearTimeout(timer); timer = setTimeout(flush, 0); }
      else if (!timer) timer = setTimeout(scheduledFlush, 16);
    },
    flush,
    dispose() { disposed = true; clearTimeout(timer); chunks = []; size = 0; }
  };
}

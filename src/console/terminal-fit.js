// Terminal sizing and scroll anchoring. Records are { id, term, fit, node,
// follow, scrollAnchor, ... } from console/terminals.js. No DOM imports, so
// the fit loop runs under Node tests with fake records.
export function keepFollowing(record) {
  const buffer = record.term.buffer.active;
  if (record.follow && buffer.viewportY < buffer.baseY) record.term.scrollToBottom();
}
export function clearTerminalAnchor(record) {
  record.anchorRestoreToken = (record.anchorRestoreToken || 0) + 1;
  record.scrollAnchor?.marker?.dispose();
  record.scrollAnchor = null;
}
export function visibleTerminalAnchor(record) {
  const buffer = record.term.buffer.active, start = buffer.viewportY;
  for (let offset = 0; offset < record.term.rows; offset++) {
    const text = buffer.getLine(start + offset)?.translateToString(true).trim();
    if (text) {
      const line = start + offset;
      let logicalLine = line;
      while (logicalLine > 0 && buffer.getLine(logicalLine)?.isWrapped) logicalLine--;
      let marker = null;
      try { marker = record.term.registerMarker(logicalLine - (buffer.baseY + buffer.cursorY)); } catch {}
      return { text, offset, line, logicalLine, cellOffset: (line - logicalLine) * record.term.cols, marker };
    }
  }
  let marker = null;
  try { marker = record.term.registerMarker(start - (buffer.baseY + buffer.cursorY)); } catch {}
  return { text: '', offset: 0, line: start, logicalLine: start, cellOffset: 0, marker };
}
function restoreTerminalAnchor(record, anchor) {
  const buffer = record.term.buffer.active;
  const markerLine = anchor.marker?.line ?? -1;
  const logicalLine = markerLine >= 0 ? markerLine : anchor.logicalLine;
  const rowOffset = Math.floor(anchor.cellOffset / Math.max(1, record.term.cols));
  const target = logicalLine + rowOffset - anchor.offset;
  const boundedTarget = Math.max(0, Math.min(buffer.baseY, target));
  record.term.scrollToLine(boundedTarget);
  return boundedTarget;
}
function scheduleTerminalAnchorRestore(record, anchor) {
  // xterm synchronizes its pixel viewport after reflow; scrolling before that
  // sync applies the line delta to the old viewport position.
  const token = record.anchorRestoreToken = (record.anchorRestoreToken || 0) + 1;
  const settle = (attempt, stable) => requestAnimationFrame(() => {
    if (record.anchorRestoreToken !== token || record.scrollAnchor !== anchor || record.follow || !record.node.isConnected || !record.node.getClientRects().length) return;
    const target = restoreTerminalAnchor(record, anchor), current = record.term.buffer.active;
    const nextStable = current.viewportY === target ? stable + 1 : 0;
    if (attempt < 6 && nextStable < 2) settle(attempt + 1, nextStable);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => settle(0, 0))));
}
// Fits each visible record to its node and reports the settled size.
// `terminals` is the live id-to-record map, used to drop stale reports.
export function fitRecords(records, { terminals, call, pixelRatio }) {
  for (const record of records) {
    if (!record || record.loading || !record.node.getClientRects().length) continue;
    try {
      const dimensions = `${record.node.clientWidth}:${record.node.clientHeight}:${record.term.options.fontSize}:${pixelRatio}`;
      if (record.dimensions === dimensions && !record.repaint) continue;
      if (record.dimensions !== dimensions) {
        const buffer = record.term.buffer.active;
        const wasFollowing = record.follow && buffer.viewportY >= buffer.baseY;
        if (wasFollowing) clearTerminalAnchor(record);
        else if (!record.scrollAnchor || (record.scrollAnchor.marker && record.scrollAnchor.marker.line < 0)) {
          clearTerminalAnchor(record);
          record.scrollAnchor = visibleTerminalAnchor(record);
        }
        const anchor = record.scrollAnchor;
        let fitted = false;
        try {
          // xterm can re-measure the cell width a fraction of a pixel differently,
          // which rounds to one column less at the same size. Reuse the size this
          // console had before at these dimensions so agents are not resized again.
          const known = record.fitted?.get(dimensions);
          if (known) record.term.resize(known.cols, known.rows);
          else {
            record.fit.fit();
            record.fitted ||= new Map();
            if (record.fitted.size > 40) record.fitted.clear();
            record.fitted.set(dimensions, { cols: record.term.cols, rows: record.term.rows });
          }
          if (wasFollowing) keepFollowing(record);
          else { record.follow = false; scheduleTerminalAnchorRestore(record, anchor); }
          fitted = true;
        } finally { if (!fitted && anchor) clearTerminalAnchor(record); }
      } else keepFollowing(record);
      record.dimensions = dimensions;
      if (record.repaint) { record.repaint = false; record.term.refresh(0, record.term.rows - 1); }
      const size = `${record.term.cols}:${record.term.rows}`;
      if (record.size !== size) {
        record.size = size;
        // Agents such as Codex repaint their whole screen on every resize, so
        // report only the size a console settles on after a drag.
        clearTimeout(record.resizeTimer);
        record.resizeTimer = setTimeout(() => {
          if (terminals.get(record.id) !== record || record.size !== `${record.term.cols}:${record.term.rows}`) return;
          call('session.resize', { id: record.id, cols: record.term.cols, rows: record.term.rows }).catch(() => {});
        }, 250);
      }
    } catch {}
  }
}

'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { SourceSnapshots } = require('./source-snapshots.cjs');
const gate = new Int32Array(workerData.gate);
try {
  const sources = new SourceSnapshots(workerData.root);
  const result = sources.capture(workerData.projectId, workerData.folder, {
    ...workerData.options,
    beforePersist() {
      parentPort.postMessage({ type: 'authorize' });
      // Only this worker waits; the desktop event loop keeps handling input.
      Atomics.wait(gate, 0, 0);
      if (Atomics.load(gate, 0) !== 1) throw Error('Source capture is no longer authorized.');
    }
  });
  parentPort.postMessage({ type: 'result', result });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error.message });
}

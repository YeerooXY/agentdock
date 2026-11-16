'use strict';
const path = require('node:path');
const { Worker } = require('node:worker_threads');

function captureInBackground(root, projectId, folder, { beforePersist = () => {}, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const gate = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(path.join(__dirname, 'source-capture-worker.cjs'), {
      workerData: { root, projectId, folder, options, gate: gate.buffer }
    });
    let result, failure;
    worker.on('message', message => {
      if (message.type === 'authorize') {
        try { beforePersist(); Atomics.store(gate, 0, 1); }
        catch (error) { failure = error; Atomics.store(gate, 0, -1); }
        Atomics.notify(gate, 0);
      } else if (message.type === 'result') result = message.result;
      else if (message.type === 'error') failure ||= new Error(message.error);
    });
    worker.on('error', error => { failure ||= error; });
    worker.on('exit', code => {
      if (failure) reject(failure);
      else if (code !== 0 || !result) reject(new Error('Source capture worker did not finish.'));
      else resolve(result);
    });
  });
}
module.exports = { captureInBackground };

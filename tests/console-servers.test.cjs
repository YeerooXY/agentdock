'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  ConsoleServers,
  findDescendants,
  parseNetstatListeners,
  parseProcessJson,
} = require('../electron/console-servers.cjs');

test('new MCP listeners and unknown services survive; known development listeners are cleaned', async () => {
  const root = { pid: 10, parentPid: 1, createdAt: '2026-11-13T10:00:00Z' };
  let processes = [root]; const stopped = [];
  const sessions = { items: new Map([['s', { launchId: 'launch', terminal: { pid: 10 } }]]) };
  const cleanup = new ConsoleServers({ sessions, platform: 'win32', collectProcesses: async () => processes,
    collectListeners: async () => processes.slice(1).map(proc => ({ pid: proc.pid, port: 3000 + proc.pid })),
    stopProcess: async pid => { stopped.push(pid); return true; } });
  await cleanup.recordStart('s', 'turn');
  processes = [root, ...['node agent-tools.cjs', 'node service.js', 'node node_modules/vite/bin/vite.js'].map((command, i) => ({ pid: 20 + i, parentPid: 10, command, createdAt: '2026-11-13T10:01:00Z' }))];
  await cleanup.cleanupTurn('s', 'turn'); assert.deepEqual(stopped, [22]);
});

test('a replaced console root and disposed cleanup never stop processes', async () => {
  for (const change of ['root', 'dispose', 'launch']) {
    const root = { pid: 10, parentPid: 1, createdAt: '2026-11-13T10:00:00Z' };
    let processes = [root]; let stopped = 0;
    const session = { launchId: 'launch', terminal: { pid: 10 } }, sessions = { items: new Map([['s', session]]) };
    const cleanup = new ConsoleServers({ sessions, platform: 'win32', collectProcesses: async () => processes,
      collectListeners: async () => [{ pid: 20, port: 3000 }], stopProcess: async () => { stopped++; return true; } });
    await cleanup.recordStart('s', 'turn');
    processes = [root, { pid: 20, parentPid: 10, command: 'python -m http.server', createdAt: '2026-11-13T10:01:00Z' }];
    if (change === 'root') processes[0] = { ...root, createdAt: '2026-11-13T10:02:00Z' };
    if (change === 'dispose') cleanup.dispose();
    if (change === 'launch') session.launchId = 'new';
    await cleanup.cleanupTurn('s', 'turn'); assert.equal(stopped, 0, change);
  }
});

test('parseNetstatListeners parses TCP listening ports and PIDs', () => {
  const sample = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1160
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       18420
  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       18420
  TCP    [::]:8080              [::]:0                 LISTENING       22340
  TCP    192.168.1.10:50123     142.250.180.206:443    ESTABLISHED     8240
  TCP    127.0.0.1:50000        127.0.0.1:50001        TIME_WAIT       0
`;
  const listeners = parseNetstatListeners(sample);
  assert.equal(listeners.length, 4);
  assert.deepEqual(listeners[0], { pid: 1160, port: 135, address: '0.0.0.0:135' });
  assert.deepEqual(listeners[1], { pid: 18420, port: 3000, address: '0.0.0.0:3000' });
  assert.deepEqual(listeners[2], { pid: 18420, port: 5173, address: '127.0.0.1:5173' });
  assert.deepEqual(listeners[3], { pid: 22340, port: 8080, address: '[::]:8080' });
  assert.deepEqual(parseNetstatListeners(''), []);
  assert.deepEqual(parseNetstatListeners(null), []);
});

test('parseProcessJson parses JSON array or single object from PowerShell', () => {
  const arrayJson = JSON.stringify([
    { ProcessId: 1000, ParentProcessId: 500, Name: 'powershell.exe', CreatedAt: '2026-11-13T20:00:00.000Z' },
    { ProcessId: 1010, ParentProcessId: 1000, Name: 'node.exe', CreatedAt: '2026-11-13T20:01:00.000Z' },
  ]);
  const parsedArray = parseProcessJson(arrayJson);
  assert.equal(parsedArray.length, 2);
  assert.equal(parsedArray[0].pid, 1000);
  assert.equal(parsedArray[0].name, 'powershell.exe');
  assert.equal(parsedArray[1].pid, 1010);

  const singleJson = JSON.stringify({
    ProcessId: 2000,
    ParentProcessId: 1,
    Name: 'cmd.exe',
    CreatedAt: '2026-11-13T20:02:00.000Z',
  });
  const parsedSingle = parseProcessJson(singleJson);
  assert.equal(parsedSingle.length, 1);
  assert.equal(parsedSingle[0].pid, 2000);

  assert.deepEqual(parseProcessJson(''), []);
  assert.deepEqual(parseProcessJson('invalid-json'), []);
});

test('findDescendants traverses tree and excludes rootPid and unrelated', () => {
  const processes = [
    { pid: 1000, parentPid: 500, name: 'terminal' },
    { pid: 1010, parentPid: 1000, name: 'powershell' },
    { pid: 1020, parentPid: 1010, name: 'npm' },
    { pid: 1030, parentPid: 1020, name: 'node-dev-server' },
    { pid: 2000, parentPid: 1, name: 'unrelated-service' },
    { pid: 2010, parentPid: 2000, name: 'unrelated-child' },
    { pid: 3000, parentPid: 3000, name: 'cyclic-proc' },
  ];
  const descendants = findDescendants(1000, processes);
  assert.equal(descendants.has(1000), false, 'rootPid itself is not in descendants');
  assert.equal(descendants.has(1010), true);
  assert.equal(descendants.has(1020), true);
  assert.equal(descendants.has(1030), true);
  assert.equal(descendants.has(2000), false);
  assert.equal(descendants.has(2010), false);
  assert.equal(descendants.has(3000), false);
  assert.equal(descendants.size, 3);
});

test('cleans up descendant listener started during turn and preserves pre-existing listeners', async () => {
  const stopped = [];
  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
    { pid: 1010, parentPid: 1000, name: 'cli-agent', createdAt: '2026-11-13T10:00:01Z' },
    { pid: 900, parentPid: 1000, name: 'old-server', createdAt: '2026-11-13T10:00:02Z' },
  ];
  let currentListeners = [
    { pid: 900, port: 3000, address: '127.0.0.1:3000' },
  ];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  // Turn starts
  await cs.recordStart('session-1', 'turn-1');

  // During the turn: new dev server started (PID 1020 on port 5173)
  currentProcesses = [
    ...currentProcesses,
    { pid: 1020, parentPid: 1010, name: 'vite-dev', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:00Z' },
  ];
  currentListeners = [
    ...currentListeners,
    { pid: 1020, port: 5173, address: '127.0.0.1:5173' },
  ];

  // Turn finishes
  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 1);
  assert.equal(result[0].pid, 1020);
  assert.deepEqual(result[0].ports, [5173]);
  assert.equal(stopped.length, 1);
  assert.deepEqual(stopped[0], { pid: 1020, identity: '2026-11-13T10:05:00Z' });
});

test('preserves unrelated processes and does not terminate console tree', async () => {
  const stopped = [];
  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
    { pid: 1010, parentPid: 1000, name: 'shell', createdAt: '2026-11-13T10:00:01Z' },
  ];
  let currentListeners = [];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  await cs.recordStart('session-1', 'turn-1');

  // During turn: unrelated process 8888 starts on port 8080 outside this console
  currentProcesses = [
    ...currentProcesses,
    { pid: 8888, parentPid: 1, name: 'other-app', createdAt: '2026-11-13T10:05:00Z' },
    { pid: 1020, parentPid: 1010, name: 'git-status', createdAt: '2026-11-13T10:05:01Z' }, // non-listener
  ];
  currentListeners = [
    { pid: 8888, port: 8080, address: '0.0.0.0:8080' },
  ];

  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 0);
  assert.equal(stopped.length, 0, 'No unrelated processes or non-listeners stopped');
});

test('validates PID creation identity immediately before stopping and skips if identity changed', async () => {
  const stopped = [];
  const warnings = [];
  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
  ];
  let currentListeners = [];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  let simulatedIdentity = '2026-11-13T10:05:00Z';

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    log: (level, msg) => { warnings.push({ level, msg }); },
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    getProcessIdentity: async () => simulatedIdentity,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  await cs.recordStart('session-1', 'turn-1');

  // Dev server 1020 started during turn with creation time T1
  currentProcesses = [
    ...currentProcesses,
    { pid: 1020, parentPid: 1000, name: 'node', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:00Z' },
  ];
  currentListeners = [
    { pid: 1020, port: 3000, address: '127.0.0.1:3000' },
  ];

  // But immediately before stop, PID 1020 exited and was recycled to another process with creation time T2!
  simulatedIdentity = '2026-11-13T10:06:00Z';

  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 0, 'Recycled PID must not be stopped');
  assert.equal(stopped.length, 0);
  assert.equal(warnings.some(w => w.msg.includes('mismatch')), true);
});

test('validates PID creation identity and skips if process exited before stop', async () => {
  const stopped = [];
  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
  ];
  let currentListeners = [];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    getProcessIdentity: async () => null, // process already exited
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  await cs.recordStart('session-1', 'turn-1');

  currentProcesses = [
    ...currentProcesses,
    { pid: 1020, parentPid: 1000, name: 'node', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:00Z' },
  ];
  currentListeners = [
    { pid: 1020, port: 3000, address: '127.0.0.1:3000' },
  ];

  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 0);
  assert.equal(stopped.length, 0);
});

test('cleans up multiple dev server listeners started in one turn', async () => {
  const stopped = [];
  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
    { pid: 1010, parentPid: 1000, name: 'shell', createdAt: '2026-11-13T10:00:01Z' },
  ];
  let currentListeners = [];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  await cs.recordStart('session-1', 'turn-1');

  // Turn starts frontend on 3000 and backend on 8080
  currentProcesses = [
    ...currentProcesses,
    { pid: 1020, parentPid: 1010, name: 'frontend', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:00Z' },
    { pid: 1030, parentPid: 1010, name: 'backend', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:01Z' },
  ];
  currentListeners = [
    { pid: 1020, port: 3000, address: '0.0.0.0:3000' },
    { pid: 1030, port: 8080, address: '127.0.0.1:8080' },
  ];

  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 2);
  const pids = result.map(r => r.pid).sort();
  assert.deepEqual(pids, [1020, 1030]);
  assert.equal(stopped.length, 2);
});

test('wires to Turns started and finished events automatically', async () => {
  const turns = new EventEmitter();
  const stopped = [];

  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
  ];
  let currentListeners = [];

  const sessions = {
    items: new Map([
      ['owner-1', { id: 'owner-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    turns,
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  turns.emit('started', { owner: 'owner-1', id: 'turn-abc' });
  await cs.pendingStarts.get('owner-1:turn-abc');

  currentProcesses = [
    ...currentProcesses,
    { pid: 1050, parentPid: 1000, name: 'dev-srv', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:00Z' },
  ];
  currentListeners = [
    { pid: 1050, port: 9000, address: '127.0.0.1:9000' },
  ];

  turns.emit('finished', { owner: 'owner-1', id: 'turn-abc' });
  await cs.pendingCleanups.get('owner-1:turn-abc');

  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].pid, 1050);

  cs.dispose();
  assert.equal(turns.listenerCount('started'), 0);
  assert.equal(turns.listenerCount('finished'), 0);
});

test('preserves MCP bridge and CLI processes present before the turn', async () => {
  const stopped = [];
  const currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
    { pid: 1010, parentPid: 1000, name: 'claude.exe', createdAt: '2026-11-13T10:00:01Z' },
    { pid: 1015, parentPid: 1010, name: 'agent-tools.cjs', createdAt: '2026-11-13T10:00:02Z' },
  ];
  // Even if MCP bridge is listening on an internal port
  const currentListeners = [
    { pid: 1015, port: 48000, address: '127.0.0.1:48000' },
  ];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  await cs.recordStart('session-1', 'turn-1');
  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 0);
  assert.equal(stopped.length, 0, 'CLI and MCP bridge are preserved');
});

test('orphan process limitation: detached process whose parent chain cannot be proven is preserved', async () => {
  const stopped = [];
  let currentProcesses = [
    { pid: 1000, parentPid: 500, name: 'terminal', createdAt: '2026-11-13T10:00:00Z' },
  ];
  let currentListeners = [];

  const sessions = {
    items: new Map([
      ['session-1', { id: 'session-1', terminal: { pid: 1000 } }],
    ]),
  };

  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => currentProcesses,
    collectListeners: async () => currentListeners,
    stopProcess: async (pid, identity) => {
      stopped.push({ pid, identity });
      return true;
    },
  });

  await cs.recordStart('session-1', 'turn-1');

  // Detached orphan process spawned via Start-Process (parentPid is explorer.exe or dead PID 9999)
  currentProcesses = [
    ...currentProcesses,
    { pid: 4000, parentPid: 9999, name: 'orphan-server', command: 'node node_modules/vite/bin/vite.js', createdAt: '2026-11-13T10:05:00Z' },
  ];
  currentListeners = [
    { pid: 4000, port: 3000, address: '127.0.0.1:3000' },
  ];

  const result = await cs.cleanupTurn('session-1', 'turn-1');

  assert.equal(result.length, 0, 'Unproven orphan process is preserved');
  assert.equal(stopped.length, 0);
});

test('gracefully handles missing session or missing terminal PID', async () => {
  const sessions = { items: new Map() };
  const cs = new ConsoleServers({
    platform: 'win32',
    sessions,
    collectProcesses: async () => [],
    collectListeners: async () => [],
  });

  const startRes = await cs.recordStart('unknown-session', 't1');
  assert.equal(startRes, null);

  const cleanRes = await cs.cleanupTurn('unknown-session', 't1');
  assert.deepEqual(cleanRes, []);
});

test('platform guard safely no-ops on non-Windows platforms', async () => {
  let collectCalled = false;
  const sessions = {
    items: new Map([['s1', { terminal: { pid: 1000 } }]]),
  };
  const cs = new ConsoleServers({
    platform: 'linux',
    sessions,
    collectProcesses: async () => { collectCalled = true; return []; },
    collectListeners: async () => [],
  });

  const startRes = await cs.recordStart('s1', 't1');
  assert.equal(startRes, null);
  assert.equal(collectCalled, false);

  const cleanRes = await cs.cleanupTurn('s1', 't1');
  assert.deepEqual(cleanRes, []);
});

'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

// Parse Windows netstat -ano -p tcp output for LISTENING TCP sockets.
function parseNetstatListeners(text) {
  if (!text || typeof text !== 'string') return [];
  const listeners = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[0].toUpperCase() === 'TCP' && parts[3].toUpperCase() === 'LISTENING') {
      const address = parts[1], pid = parseInt(parts[4], 10), lastColon = address.lastIndexOf(':');
      const port = lastColon !== -1 ? parseInt(address.slice(lastColon + 1), 10) : 0;
      if (Number.isInteger(pid) && pid > 0 && port > 0) listeners.push({ pid, port, address });
    }
  }
  return listeners;
}

// Parse PowerShell ConvertTo-Json output for Win32_Process.
function parseProcessJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  let parsed;
  try { parsed = JSON.parse(trimmed); } catch { return []; }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.map(item => ({
    pid: item.ProcessId, parentPid: item.ParentProcessId,
    name: item.Name || '', command: item.CommandLine || '', createdAt: item.CreatedAt ? String(item.CreatedAt) : '',
  })).filter(p => Number.isInteger(p.pid) && p.pid > 0);
}

// Collect all descendant processes under rootPid via BFS.
function findDescendants(rootPid, processes) {
  const childrenMap = new Map();
  for (const p of processes) {
    if (!childrenMap.has(p.parentPid)) childrenMap.set(p.parentPid, []);
    childrenMap.get(p.parentPid).push(p);
  }
  const descendants = new Map();
  const queue = [...(childrenMap.get(rootPid) || [])];
  while (queue.length > 0) {
    const current = queue.shift();
    const parent = processes.find(proc => proc.pid === current.parentPid);
    if (parent?.createdAt && current.createdAt && Date.parse(parent.createdAt) > Date.parse(current.createdAt)) continue;
    if (!descendants.has(current.pid) && current.pid !== rootPid) {
      descendants.set(current.pid, current);
      for (const child of childrenMap.get(current.pid) || []) {
        if (!descendants.has(child.pid) && child.pid !== rootPid) queue.push(child);
      }
    }
  }
  return descendants;
}

// Bounded Windows collectors and stopper.
async function defaultCollectListeners() {
  const { stdout } = await exec('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 10000 });
  return parseNetstatListeners(stdout);
}

async function defaultCollectProcesses() {
  const command = 'Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, @{N="CreatedAt";E={if ($_.CreationDate) { $_.CreationDate.ToString("o") } else { "" }}} | ConvertTo-Json -Compress';
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
  return parseProcessJson(stdout);
}

async function defaultGetProcessIdentity(pid) {
  const command = `try { (Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CreationDate.ToString("o") } catch { "" }`;
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5000 });
  return stdout.trim() || null;
}

async function defaultStopProcess(pid, identity) {
  if (!Number.isInteger(pid) || pid <= 0 || !/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)?$/.test(identity || '')) return false;
  // Hold the process handle across the final identity check and Kill; a reused
  // PID cannot redirect this operation to a different process.
  const command = `$ErrorActionPreference='Stop'; try { $p=Get-Process -Id ${pid}; $handle=$p.Handle; $expected=[DateTime]::Parse('${identity}').ToUniversalTime().ToString('yyyyMMddHHmmssffffff'); if ($p.StartTime.ToUniversalTime().ToString('yyyyMMddHHmmssffffff') -eq $expected) { $p.Kill(); 'stopped' } } catch { }`;
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5000 });
  return stdout.trim() === 'stopped';
}

function developmentServer(proc) {
  const command = proc.command || '';
  if (/mcp|agent-tools|claude|codex|electron/i.test(command)) return false;
  return /(?:^|[\s\\/])(?:vite(?:\.js)?|http-server|webpack-dev-server|react-scripts)(?:[\s"'\\/]|$)|\bpython(?:\d+(?:\.\d+)*)?(?:\.exe)?["']?\s+-m\s+http\.server\b|[\\/]next[\\/]dist[\\/]bin[\\/]next(?:[\s"']|$)/i.test(command);
}

/**
 * ConsoleServers: cleans up console-owned dev server listeners after a turn.
 *
 * Orphan-process limitation:
 * On Windows, processes detached from the console hierarchy (e.g. via Start-Process
 * or where intermediate parents exited before the end snapshot) cannot be proven
 * to belong to this console. To prevent terminating unrelated processes or violating
 * security boundaries, unproven orphan processes are preserved.
 */
class ConsoleServers {
  constructor({
    turns,
    sessions,
    platform = process.platform,
    collectProcesses,
    collectListeners,
    getProcessIdentity,
    stopProcess,
    log = () => {},
  } = {}) {
    this.platform = platform;
    this.sessions = sessions || null;
    this.turns = turns || null;
    this.log = log;
    this.snapshots = new Map();
    this.pendingStarts = new Map();
    this.pendingCleanups = new Map();
    this.latestTurns = new Map();
    this.disposed = false;
    this._collectProcesses = collectProcesses;
    this._collectListeners = collectListeners;
    this._getProcessIdentity = getProcessIdentity;
    this._stopProcess = stopProcess || defaultStopProcess;

    if (this.turns) this.bind(this.turns, this.sessions);
  }

  bind(turns, sessions) {
    if (sessions) this.sessions = sessions;
    if (this.turns && this.turns !== turns) this.unbind();
    this.turns = turns;
    this._onStarted = ({ owner, id }) => { void this.recordStart(owner, id); };
    this._onFinished = ({ owner, id }) => { void this.cleanupTurn(owner, id); };
    this.turns.on('started', this._onStarted);
    this.turns.on('finished', this._onFinished);
    return this;
  }

  unbind() {
    if (this.turns) {
      if (this._onStarted) this.turns.off('started', this._onStarted);
      if (this._onFinished) this.turns.off('finished', this._onFinished);
      this._onStarted = null;
      this._onFinished = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.unbind();
    this.snapshots.clear();
    this.pendingStarts.clear();
    this.pendingCleanups.clear();
  }

  async collectProcesses() {
    if (this._collectProcesses) return this._collectProcesses();
    return defaultCollectProcesses();
  }

  async collectListeners() {
    if (this._collectListeners) return this._collectListeners();
    return defaultCollectListeners();
  }

  async getProcessIdentity(pid) {
    if (this._getProcessIdentity) return this._getProcessIdentity(pid);
    if (this._collectProcesses) {
      const procs = await this.collectProcesses();
      const match = procs.find(p => p.pid === pid);
      return match ? match.createdAt : null;
    }
    return defaultGetProcessIdentity(pid);
  }

  async stopProcess(pid, identity) {
    return this._stopProcess(pid, identity);
  }

  async recordStart(owner, turnId) {
    if (this.disposed || this.platform !== 'win32') return null;
    this.latestTurns.set(owner, turnId);
    const session = this.sessions?.items?.get?.(owner) || this.sessions?.getSession?.(owner);
    const rootPid = session?.terminal?.pid;
    if (!Number.isInteger(rootPid) || rootPid <= 0) return null;

    const key = `${owner}:${turnId}`;
    const task = (async () => {
      try {
        const processes = await this.collectProcesses();
        const existingPids = new Map(processes.map(p => [p.pid, p.createdAt]));
        const rootIdentity = existingPids.get(rootPid);
        if (!rootIdentity || this.disposed) return null;
        const snapshot = {
          rootPid,
          rootIdentity, session, launchId: session.launchId,
          startedAt: Date.now(),
          existingPids,
        };
        this.snapshots.set(key, snapshot);
        return snapshot;
      } catch (error) {
        this.log('error', `ConsoleServers start snapshot error: ${error.message}`);
        return null;
      }
    })();

    this.pendingStarts.set(key, task);
    try {
      return await task;
    } finally {
      this.pendingStarts.delete(key);
    }
  }

  async cleanupTurn(owner, turnId) {
    if (this.disposed || this.platform !== 'win32') return [];
    const key = `${owner}:${turnId}`;
    const task = (async () => {
      if (this.pendingStarts.has(key)) {
        await this.pendingStarts.get(key);
      }
      const startSnapshot = this.snapshots.get(key);
      this.snapshots.delete(key);
      if (!startSnapshot) return [];

      const session = this.sessions?.items?.get?.(owner) || this.sessions?.getSession?.(owner);
      const rootPid = session?.terminal?.pid;
      const current = () => !this.disposed && this.latestTurns.get(owner) === turnId && session === startSnapshot.session && session?.launchId === startSnapshot.launchId && session?.terminal?.pid === startSnapshot.rootPid && this.sessions?.items?.get?.(owner) === session;
      if (!current()) return [];

      try {
        const [processes, listeners] = await Promise.all([
          this.collectProcesses(),
          this.collectListeners(),
        ]);

        if (processes.find(proc => proc.pid === rootPid)?.createdAt !== startSnapshot.rootIdentity || !current()) return [];
        const descendants = findDescendants(rootPid, processes.filter(proc => Number.isFinite(Date.parse(proc.createdAt))));
        const listenerPidMap = new Map();
        for (const l of listeners) {
          if (!listenerPidMap.has(l.pid)) listenerPidMap.set(l.pid, []);
          listenerPidMap.get(l.pid).push(l);
        }

        const toStop = [];
        for (const [pid, proc] of descendants) {
          if (pid === rootPid || !proc.createdAt || !developmentServer(proc)) continue;
          const procListeners = listenerPidMap.get(pid);
          if (!procListeners || procListeners.length === 0) continue;

          // Preserve pre-existing processes started before this turn
          const existingCreatedAt = startSnapshot.existingPids.get(pid);
          if (startSnapshot.existingPids.has(pid) && (!existingCreatedAt || String(existingCreatedAt) === String(proc.createdAt))) {
            continue;
          }

          toStop.push({
            pid,
            name: proc.name,
            createdAt: proc.createdAt,
            ports: procListeners.map(l => l.port),
          });
        }

        const stopped = [];
        for (const target of toStop) {
          // Validate PID creation identity immediately before stopping
          const currentIdentity = await this.getProcessIdentity(target.pid);
          if (!current() || !currentIdentity || String(currentIdentity) !== String(target.createdAt)) {
            this.log('warn', `PID ${target.pid} identity mismatch or exited before stop.`);
            continue;
          }

          try {
            const success = await this.stopProcess(target.pid, target.createdAt);
            if (success) stopped.push(target);
          } catch (error) {
            this.log('error', `Failed to stop PID ${target.pid}: ${error.message}`);
          }
        }

        return stopped;
      } catch (error) {
        this.log('error', `ConsoleServers cleanup error: ${error.message}`);
        return [];
      }
    })();

    this.pendingCleanups.set(key, task);
    try {
      return await task;
    } finally {
      this.pendingCleanups.delete(key);
      if (this.latestTurns.get(owner) === turnId) this.latestTurns.delete(owner);
    }
  }
}

module.exports = {
  ConsoleServers,
  findDescendants,
  parseNetstatListeners,
  parseProcessJson,
  defaultCollectListeners,
  defaultCollectProcesses,
  defaultGetProcessIdentity,
  defaultStopProcess,
};

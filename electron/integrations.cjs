'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { readJson, atomicJson } = require('./storage.cjs');
const { findProgram } = require('./adapters.cjs');
const BLENDER_VERSION = '2.1.9';
const MESHY_VERSION = '0.6.4';
const definitions = [
  { id: 'blender', name: 'Blender', description: 'Create and edit scenes, materials and models in Blender.', version: BLENDER_VERSION, docs: 'https://github.com/ahujasid/mcp-for-blender' },
  { id: 'unity', name: 'Unity', description: 'Work with scenes, assets and scripts in your Unity project.', version: 'Unity CLI', docs: 'https://docs.unity.com/en-us/unity-cli/unity-cli-reference' },
  { id: 'meshy', name: 'Meshy AI', description: 'Generate, texture, rig and download 3D assets.', version: MESHY_VERSION, docs: 'https://www.meshy.ai/developers/keys' }
];
function directories(root) { try { return fs.readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => path.join(root, x.name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); } catch { return []; } }
function existing(files) { return files.filter(Boolean).find(file => fs.existsSync(file)); }
function discover() {
  const blender = existing([findProgram('blender.exe'), ...directories(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation')).map(dir => path.join(dir, 'blender.exe'))]);
  const python = blender && existing(directories(path.dirname(blender)).filter(dir => /^\d+\.\d+$/.test(path.basename(dir))).map(dir => path.join(dir, 'python', 'bin', 'python.exe')));
  const unity = existing([findProgram('unity.exe'), path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Unity', 'bin', 'unity.exe')]);
  return { blender, python, unity };
}
function processEnvironment() {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) if (['path', 'pathext', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'userprofile', 'appdata', 'localappdata', 'home', 'programfiles', 'programfiles(x86)', 'programdata'].includes(name.toLowerCase())) env[name] = value;
  env.BLENDER_MCP_DISABLE_TELEMETRY = 'true';
  return env;
}
function runProgram(command, args, cwd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: processEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = chunk => { if (output.length < 200000) output += chunk; };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Setup timed out. Check your connection and try again.')); }, timeout);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Could not start the setup command. Check that the application is installed.')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error('Setup did not finish. Check the application and your connection, then try again.')); });
  });
}
function unityProject(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.existsSync(path.join(value, 'ProjectSettings', 'ProjectVersion.txt')) || !fs.existsSync(path.join(value, 'Packages', 'manifest.json'))) throw new Error('Choose a Unity project folder with Packages and ProjectSettings inside it.');
  return path.resolve(value);
}
class ToolIntegrations {
  constructor(root, runtime, { detect = discover, run = runProgram, onChange = () => {} } = {}) {
    this.root = path.join(root, 'integrations'); fs.mkdirSync(this.root, { recursive: true });
    this.runtime = runtime; this.detect = detect; this.run = run; this.onChange = onChange;
    this.programs = detect(); this.jobs = new Map();
    this.file = path.join(this.root, 'installed.json'); this.installed = readJson(this.file, {});
  }
  blenderServer() { return path.join(this.root, 'blender', 'Scripts', 'mcp-for-blender.exe'); }
  refresh() { this.programs = this.detect(); }
  snapshot(connections, keys) {
    return definitions.map(item => {
      const connection = connections.find(x => x.integration === item.id);
      const ready = item.id === 'blender' ? fs.existsSync(this.blenderServer()) && this.installed.blender === BLENDER_VERSION : item.id === 'unity' ? !!this.programs.unity && !!connection?.projectPath : !!this.runtime.node && fs.existsSync(this.runtime.meshy) && !!connection && keys.some(x => x.id === connection.envKeys?.MESHY_API_KEY?.key);
      return { ...item, ready, connected: !!connection, enabled: connection?.enabled !== false, setupNote: item.id === 'blender' ? this.installed.blenderNote || '' : '', projectPath: connection?.projectPath || '', keyId: connection?.envKeys?.MESHY_API_KEY?.key || '', available: item.id === 'blender' ? !!this.programs.blender && !!this.programs.python : item.id === 'unity' ? !!this.programs.unity : !!this.runtime.node && fs.existsSync(this.runtime.meshy), job: this.jobs.get(item.id) || null };
    });
  }
  resolve(connection) {
    if (!connection.integration) return connection;
    if (connection.integration === 'meshy') {
      if (!fs.existsSync(this.runtime.meshy)) throw new Error('Meshy is missing from this build. Reinstall Agent Dock.');
      return { ...connection, command: this.runtime.node, args: [this.runtime.meshy], cwd: this.root };
    }
    if (connection.integration === 'blender') {
      if (!fs.existsSync(this.blenderServer())) throw new Error('Set up Blender from Tools first.');
      return { ...connection, command: this.blenderServer(), args: [], cwd: this.root };
    }
    if (!this.programs.unity) throw new Error('Install the Unity CLI, then check again in Tools.');
    return { ...connection, command: this.programs.unity, args: ['mcp', '--project-path', unityProject(connection.projectPath)], cwd: connection.projectPath };
  }
  async prepare(id, payload = {}) {
    const definition = definitions.find(x => x.id === id);
    if (!definition) throw new Error('Unknown integration.');
    if (this.jobs.get(id)?.busy) throw new Error('Setup is already running.');
    const progress = message => { this.jobs.set(id, { busy: true, message }); this.onChange(); };
    progress('Preparing…');
    try {
      this.refresh();
      let details;
      if (id === 'blender') {
        if (!this.programs.blender || !this.programs.python) throw new Error('Install Blender first, then check again.');
        const folder = path.join(this.root, 'blender'), python = path.join(folder, 'Scripts', 'python.exe');
        progress('Installing Blender tools…');
        if (!fs.existsSync(python)) await this.run(this.programs.python, ['-m', 'venv', folder], this.root);
        await this.run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', `mcp-for-blender==${BLENDER_VERSION}`], this.root);
        progress('Installing the Blender add-on…');
        // The upstream helper backs up older add-ons and avoids saving preferences
        // while Blender is open or before the user's settings migration. It does
        // not edit any other agent's configuration (unlike the full setup command).
        const output = await this.run(python, ['-c', "import sys,json; from blender_mcp.setup_cli import setup_addon; r=setup_addon(False); print('AGENT_DOCK_ADDON '+json.dumps({'installed':r.installed,'enabled':r.enabled,'lines':r.lines})); sys.exit(0 if r.installed else 1)"], this.root);
        const line = output.split(/\r?\n/).find(x => x.startsWith('AGENT_DOCK_ADDON '));
        if (!line) throw new Error('The add-on installer did not report a result. Try setup again.');
        const result = JSON.parse(line.slice('AGENT_DOCK_ADDON '.length));
        if (!result.installed) throw new Error('The Blender add-on could not be installed.');
        this.installed.blenderNote = result.enabled ? '' : 'In Blender, enable MCP for Blender in Preferences → Add-ons, then start it from the N sidebar.';
        this.installed.blender = BLENDER_VERSION; atomicJson(this.file, this.installed);
        details = { command: this.blenderServer(), args: [], cwd: this.root, envKeys: {} };
      } else if (id === 'unity') {
        if (!this.programs.unity) throw new Error('Install the Unity CLI first, then check again.');
        const projectPath = unityProject(payload.projectPath);
        progress('Adding Unity Pipeline to your project…');
        await this.run(this.programs.unity, ['pipeline', 'install', '--project-path', projectPath, '--non-interactive', '--no-banner'], projectPath);
        details = { command: this.programs.unity, args: ['mcp', '--project-path', projectPath], cwd: projectPath, projectPath, envKeys: {} };
      } else {
        if (!this.runtime.node || !fs.existsSync(this.runtime.meshy)) throw new Error('Meshy is missing from this build. Reinstall Agent Dock.');
        if (!payload.keyId) throw new Error('Save a Meshy API key in Keys, then choose it here.');
        details = { command: this.runtime.node, args: [this.runtime.meshy], cwd: this.root, envKeys: { MESHY_API_KEY: { key: payload.keyId, prefix: '' } } };
      }
      this.jobs.delete(id);
      return { id, name: definition.name, description: definition.description, integration: id, type: 'stdio', enabled: true, ...details };
    } catch (error) { this.jobs.set(id, { busy: false, message: error.message }); throw error; }
    finally { this.onChange(); }
  }
}
module.exports = { ToolIntegrations, definitions, unityProject, discover, processEnvironment, BLENDER_VERSION, MESHY_VERSION };

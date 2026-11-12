'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const tools = [
  { name: 'models', description: 'List installed Upscayl models. Upscaling runs locally with Vulkan; no image upload or API key.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'upscale_image', description: 'Upscale one local PNG, JPEG or WebP to a new PNG. Originals and existing outputs are preserved. Uses the local Vulkan GPU, with a 110-second limit.', inputSchema: { type: 'object', properties: {
    input: { type: 'string', description: 'Absolute path of the input image.' }, output: { type: 'string', description: 'New absolute .png path in an existing folder.' },
    model: { type: 'string', default: 'high-fidelity-4x' }, scale: { type: 'integer', enum: [2, 3, 4], default: 4 }, gpu: { type: 'integer', minimum: 0, maximum: 15, description: 'Optional Vulkan GPU index. Omit for automatic selection.' }
  }, required: ['input', 'output'], additionalProperties: false } }
];
function pngSize(file) {
  const handle = fs.openSync(file, 'r'), header = Buffer.alloc(24);
  try { if (fs.readSync(handle, header, 0, 24, 0) !== 24 || header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || header.toString('ascii', 12, 16) !== 'IHDR') throw Error('Upscayl did not produce a valid PNG.'); } finally { fs.closeSync(handle); }
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (!width || !height) throw Error('Upscayl produced an empty image.');
  return { width, height };
}
function localEnvironment() {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME']) if (process.env[key]) env[key] = process.env[key];
  return env;
}
class UpscaylEngine {
  constructor(engine, models, { launch = spawn, timeout = 110000 } = {}) { Object.assign(this, { engine, models, launch, timeout, busy: false, child: null }); }
  listModels() { return fs.readdirSync(this.models).filter(name => /^[a-z0-9_-]+\.param$/i.test(name) && fs.existsSync(path.join(this.models, name.replace(/\.param$/, '.bin')))).map(name => name.slice(0, -6)).sort(); }
  async upscale(args) {
    if (this.busy) throw Error('Upscayl is processing another image. Wait for it to finish.');
    const { input, output, model = 'high-fidelity-4x', scale = 4, gpu } = args;
    if (Object.keys(args).some(key => !['input', 'output', 'model', 'scale', 'gpu'].includes(key))) throw Error('Unknown Upscayl option.');
    if (typeof input !== 'string' || !path.isAbsolute(input) || !/\.(png|jpe?g|webp)$/i.test(input) || !fs.statSync(input).isFile() || fs.statSync(input).size > 64 * 1024 ** 2) throw Error('Choose a local PNG, JPEG or WebP file up to 64 MB.');
    if (typeof output !== 'string' || !path.isAbsolute(output) || !/\.png$/i.test(output)) throw Error('Use a new absolute PNG output path.');
    const destination = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
    if (fs.existsSync(destination)) throw Error('The output already exists. Choose another filename.');
    if (!this.listModels().includes(model) || ![2, 3, 4].includes(scale) || gpu !== undefined && (!Number.isInteger(gpu) || gpu < 0 || gpu > 15)) throw Error('Choose an installed model, scale 2–4 and an optional GPU index 0–15.');
    this.busy = true;
    let staging;
    const started = Date.now();
    try {
      staging = fs.mkdtempSync(path.join(path.dirname(destination), '.upscayl-'));
      const temporary = path.join(staging, 'output.png');
      const commandArgs = ['-i', fs.realpathSync(input), '-o', temporary, '-m', this.models, '-n', model, '-s', String(scale), '-z', '4', '-t', '256', '-f', 'png', ...(gpu === undefined ? [] : ['-g', String(gpu)])];
      const log = await new Promise((resolve, reject) => {
        let output = '', timedOut = false;
        const child = this.child = this.launch(this.engine, commandArgs, { shell: false, windowsHide: true, env: localEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
        const collect = chunk => { output = (output + chunk.toString()).slice(-6000); };
        child.stdout.on('data', collect); child.stderr.on('data', collect);
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, this.timeout);
        child.once('error', error => { clearTimeout(timer); reject(Error('Could not start the Upscayl engine: ' + error.message)); });
        child.once('close', code => { clearTimeout(timer); timedOut ? reject(Error('Upscayl exceeded 110 seconds. Try a smaller input or the upscayl-lite-4x model.')) : code === 0 ? resolve(output) : reject(Error('Upscayl failed. Check the Vulkan driver or GPU index. ' + output.slice(-1200))); });
      });
      const dimensions = pngSize(temporary);
      if (fs.statSync(temporary).size > 512 * 1024 ** 2) throw Error('The output exceeds 512 MB. Use a smaller image or scale.');
      fs.copyFileSync(temporary, destination, fs.constants.COPYFILE_EXCL);
      return { output: destination, ...dimensions, scale, model, gpu: gpu ?? 'auto', elapsedMs: Date.now() - started, gpuInfo: [...new Set((log.match(/\[\d+ [^\]\r\n]+\]/g) || []))] };
    } finally {
      this.child = null; this.busy = false;
      if (staging && path.dirname(fs.realpathSync(staging)) === fs.realpathSync(path.dirname(destination)) && path.basename(staging).startsWith('.upscayl-')) fs.rmSync(staging, { recursive: true });
    }
  }
  close() { this.child?.kill(); }
}
module.exports = { tools, UpscaylEngine, pngSize, localEnvironment };

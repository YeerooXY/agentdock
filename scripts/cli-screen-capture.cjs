// Drives `codex` /model flow in a pty; prints the rendered screen at each step. No model request is sent.
const root = 'C:/Users/7yeer/Projects/agent-dock/node_modules/';
const pty = require(root + 'node-pty');
const { Terminal } = require(root + '@xterm/headless');
const term = new Terminal({ cols: 60, rows: 24, allowProposedApi: true });
const p = pty.spawn(process.env.COMSPEC || 'cmd.exe', ['/c', (process.env.CLI || 'codex') + (process.env.ARGS ? ' ' + process.env.ARGS : '')], {
  name: 'xterm-256color', cols: 60, rows: 24, cwd: process.argv[2] || 'C:/Users/7yeer/Projects/agent-dock', env: process.env,
});
p.onData((d) => { term.write(d); if (d.includes('\x1b[6n')) p.write('\x1b[1;1R'); });
const screen = () => {
  const b = term.buffer.active; const out = [];
  for (let i = 0; i < term.rows; i++) out.push((b.getLine(b.baseY + i)?.translateToString(true) ?? ''));
  return out.join('\n').replace(/\n+$/, '');
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = JSON.parse(process.argv[3] || '[]');
(async () => {
  await wait(Number(process.env.WAIT||9000));
  console.log('--- start\n' + screen());
  for (const s of steps) {
    p.write(s.replace(/\\r/g, '\r').replace(/\\e/g, '\x1b'));
    await wait(1800);
    console.log('--- after ' + JSON.stringify(s) + '\n' + screen());
  }
  p.kill(); process.exit(0);
})();

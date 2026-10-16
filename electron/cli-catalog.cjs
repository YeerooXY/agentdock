'use strict';
// Installation sources reviewed 2026-10-16. Recipes are fixed here; the renderer
// can select IDs, never supply a package, download URL or shell command.
const catalog = [
  { id: 'codex', name: 'Codex', command: 'codex', script: 'https://chatgpt.com/codex/install.ps1', docs: 'https://learn.chatgpt.com/docs/codex/cli', auth: 'Sign in with ChatGPT in your console.', native: true },
  { id: 'claude', name: 'Claude Code', command: 'claude', script: 'https://claude.ai/install.ps1', docs: 'https://code.claude.com/docs/en/setup', auth: 'Sign in with your Claude account in your console.', native: true },
  { id: 'antigravity', name: 'Google Antigravity', command: 'agy', script: 'https://antigravity.google/cli/install.ps1', docs: 'https://www.antigravity.google/docs/install?tab=cli', auth: 'Sign in with Google in your console.', mcp: '.gemini/config/mcp_config.json', windowsBuild: 22000 },
  { id: 'copilot', name: 'GitHub Copilot', command: 'copilot', npm: '@github/copilot', docs: 'https://docs.github.com/en/copilot/get-started/cli-quickstart', auth: 'Use /login with your GitHub account.', model: '--model', unrestricted: ['--allow-all'], native: true },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', npm: 'opencode-ai', docs: 'https://opencode.ai/docs/', auth: 'Use /connect to choose your provider, including Z.AI.', model: '--model', native: true },
  { id: 'cursor', name: 'Cursor', command: 'agent', aliases: ['cursor-agent'], script: 'https://cursor.com/install?win32=true', docs: 'https://cursor.com/docs/cli/overview', auth: 'Sign in with Cursor when the console opens.', model: '--model', mcp: '.cursor/mcp.json' },
  { id: 'grok', name: 'Grok Build', command: 'grok', npm: '@xai-official/grok', docs: 'https://docs.x.ai/build/overview', auth: 'Sign in with your Grok account when prompted.', model: '--model', unrestricted: ['--always-approve'], mcp: '.grok/config.toml' },
  { id: 'kiro', name: 'Kiro', command: 'kiro-cli', script: 'https://cli.kiro.dev/install.ps1', docs: 'https://kiro.dev/docs/getting-started/installation/', auth: 'Use kiro-cli login to sign in. Windows may request permission during installation.', args: ['chat'], mcp: '.kiro/settings/mcp.json', windowsBuild: 22000, unrestricted: ['--trust-all-tools'] },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen', npm: '@qwen-code/qwen-code', docs: 'https://qwenlm.github.io/qwen-code-docs/en/users/overview/', auth: 'Choose Qwen OAuth or your own provider in the console.', model: '--model', native: true, unrestricted: ['--approval-mode', 'yolo'] },
  { id: 'kimi', name: 'Kimi Code', command: 'kimi', script: 'https://code.kimi.com/kimi-code/install.ps1', docs: 'https://moonshotai.github.io/kimi-cli/en/guides/getting-started.html', auth: 'Use /login, then choose Kimi Code.', model: '--model', native: true },
  { id: 'cline', name: 'Cline', command: 'cline', npm: 'cline', docs: 'https://docs.cline.bot/cline-cli/overview', auth: 'Run cline auth to choose your account or provider.', model: '--model', mcp: '.cline/data/settings/cline_mcp_settings.json' },
  { id: 'droid', name: 'Factory Droid', command: 'droid', npm: 'droid', docs: 'https://docs.factory.com/cli/getting-started/quickstart', auth: 'Sign in with Factory when prompted.', model: '--model', mcp: '.factory/mcp.json' },
  { id: 'pi', name: 'Pi', command: 'pi', npm: '@earendil-works/pi-coding-agent', ignoreScripts: true, docs: 'https://pi.dev/docs/', auth: 'Use /login to choose your provider.', model: '--model', mcp: '.pi/agent/mcp.json' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', npm: '@google/gemini-cli', docs: 'https://geminicli.com/docs/get-started/installation/', auth: 'For supported paid or API accounts. Google directs personal/free users to Antigravity CLI.', model: '--model', native: true, windowsBuild: 26100, unrestricted: ['--approval-mode', 'yolo'] }
];
const byId = new Map(catalog.map(x => [x.id, x]));
const providers = [...byId.keys(), 'shell', 'custom'];
module.exports = { catalog, byId, providers };

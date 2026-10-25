'use strict';
// Installation sources reviewed 2026-10-25. Recipes are fixed here; the renderer
// can select IDs, never supply a package, download URL or shell command.
// Unrestricted flags were read from each CLI's --help on 2026-10-25. Pi has no
// approval prompts, so it has no unrestricted mode to switch.
const catalog = [
  { id: 'codex', name: 'Codex', command: 'codex', script: 'https://chatgpt.com/codex/install.ps1', docs: 'https://learn.chatgpt.com/docs/codex/cli', auth: 'Sign in with ChatGPT in your console.', native: true },
  { id: 'claude', name: 'Claude Code', command: 'claude', script: 'https://claude.ai/install.ps1', docs: 'https://code.claude.com/docs/en/setup', auth: 'Sign in with your Claude account in your console.', native: true },
  { id: 'antigravity', name: 'Google Antigravity', command: 'agy', script: 'https://antigravity.google/cli/install.ps1', installArgs: ['--skip-path'], docs: 'https://antigravity.google/docs/cli/install/', auth: 'Sign in with Google when the CLI opens.', mcp: '.gemini/config/mcp_config.json', windowsBuild: 22000, unrestricted: ['--dangerously-skip-permissions'] },
  { id: 'copilot', name: 'GitHub Copilot', command: 'copilot', npm: '@github/copilot', docs: 'https://docs.github.com/en/copilot/get-started/cli-quickstart', auth: 'Use /login with your GitHub account.', model: '--model', unrestricted: ['--allow-all'], native: true },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', npm: 'opencode-ai', docs: 'https://opencode.ai/docs/', auth: 'Use /connect to choose your provider, including Z.AI.', model: '--model', native: true, unrestricted: ['--auto'] },
  { id: 'cursor', name: 'Cursor', command: 'agent', aliases: ['cursor-agent'], script: 'https://cursor.com/install?win32=true', docs: 'https://cursor.com/docs/cli/installation', auth: 'Sign in with Cursor when the CLI opens.', model: '--model', mcp: '.cursor/mcp.json', unrestricted: ['--force'] },
  { id: 'grok', name: 'Grok Build', command: 'grok', script: 'https://x.ai/cli/install.ps1', docs: 'https://docs.x.ai/build/overview', auth: 'Sign in with your xAI account when prompted.', model: '--model', unrestricted: ['--always-approve'], mcp: '.grok/config.toml' },
  { id: 'kiro', name: 'Kiro', command: 'kiro-cli', script: 'https://cli.kiro.dev/install.ps1', docs: 'https://kiro.dev/docs/cli/setup/', auth: 'Run kiro-cli login, or sign in when the chat opens.', args: ['chat'], model: '--model', mcp: '.kiro/settings/mcp.json', windowsBuild: 22000, unrestricted: ['--trust-all-tools'] },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen', npm: '@qwen-code/qwen-code', docs: 'https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/', auth: 'Run /auth to choose QwenCloud, ModelStudio, a provider or a custom endpoint. Qwen OAuth ended April 15, 2026.', model: '--model', native: true, unrestricted: ['--approval-mode', 'yolo'] },
  { id: 'kimi', name: 'Kimi Code', command: 'kimi', script: 'https://code.kimi.com/kimi-code/install.ps1', docs: 'https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md', auth: 'Run /login to connect your account. For global accounts, use kimi login --region global.', model: '--model', native: true, unrestricted: ['--yolo'] },
  { id: 'cline', name: 'Cline', command: 'cline', npm: 'cline', docs: 'https://docs.cline.bot/usage/cli-overview', auth: 'Run cline auth to choose the Cline provider, ClinePass or your provider key.', model: '--model', mcp: '.cline/data/settings/cline_mcp_settings.json', unrestricted: ['--auto-approve', 'true'] },
  { id: 'droid', name: 'Factory Droid', command: 'droid', npm: 'droid', docs: 'https://docs.factory.com/droid-cli/quickstart', auth: 'Sign in with Factory when prompted.', model: '--model', mcp: '.factory/mcp.json', unrestricted: ['--auto', 'high'] },
  { id: 'pi', name: 'Pi', command: 'pi', npm: '@earendil-works/pi-coding-agent', ignoreScripts: true, docs: 'https://pi.dev/docs/latest/quickstart', auth: 'Run /login to choose a provider, subscription, API key or local model.', model: '--model', mcp: '.pi/agent/mcp.json' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', npm: '@google/gemini-cli', docs: 'https://geminicli.com/docs/get-started/installation/', auth: 'Choose a Google sign-in or another supported Google authentication method when prompted.', model: '--model', native: true, windowsBuild: 26100, unrestricted: ['--approval-mode', 'yolo'] }
];
const byId = new Map(catalog.map(x => [x.id, x]));
const providers = [...byId.keys(), 'shell', 'custom'];
module.exports = { catalog, byId, providers };

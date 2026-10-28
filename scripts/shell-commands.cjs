'use strict';
// Console commands for the desktop tests, written for the shell each system
// opens: PowerShell on Windows, the login shell (bash/zsh) on macOS and Linux.
// Markers are assembled by the shell, so the echoed command line never matches.
const windows = process.platform === 'win32';
const sh = text => "'" + String(text).replaceAll("'", "'\"'\"'") + "'";
const ps = text => "'" + String(text).replaceAll("'", "''") + "'";
// Print `first + second` as one word.
const join = (first, second) => windows ? `Write-Output (${ps(first)} + ${ps(second)})` : `printf '%s%s\\n' ${sh(first)} ${sh(second)}`;
// Print a fixed line.
const say = text => windows ? `Write-Output ${ps(text)}` : `printf '%s\\n' ${sh(text)}`;
// Run a program with arguments.
const run = (program, ...args) => windows ? `& ${[program, ...args].map(ps).join(' ')}` : [program, ...args].map(sh).join(' ');
// Write raw text, such as an escape sequence, to the terminal.
const write = text => windows ? `[Console]::Write(${ps(text).replace('\u001b', "' + [char]27 + '")})` : `printf '%b' ${sh(text.replace('\u001b', '\\033'))}`;
// Save the shared-tool bridge address and token as JSON.
const saveBridge = file => windows
  ? `@{url=$env:PADDOCK_BRIDGE_URL;token=$env:PADDOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath ${ps(file)}`
  : `printf '{"url":"%s","token":"%s"}' "$PADDOCK_BRIDGE_URL" "$PADDOCK_BRIDGE_TOKEN" > ${sh(file)}`;
// A ready prompt: "PS C:\..>" in PowerShell, "$ " or "% " in bash and zsh.
const prompt = text => windows ? text.includes('PS ') : /[$%#] $/m.test(text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ''));
// CI hosts can have very long prompts; in a small console they wrap and push a marker out of view.
// Set a two-character prompt in the same command line (bash reads PS1, zsh PROMPT).
const shortPrompt = command => windows ? command : `PS1='$ ' PROMPT='$ '; ${command}`;
module.exports = { windows, join, say, run, write, saveBridge, prompt, shortPrompt };

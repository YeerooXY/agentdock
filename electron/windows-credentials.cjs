'use strict';
// Reads and writes one generic Windows Credential Manager entry through the
// Win32 Cred* API. The secret never appears in arguments, the environment or
// logs: the script is passed encoded, and the secret travels over stdin/stdout.
const { spawn } = require('node:child_process');

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class PaddockCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment; public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredReadW(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredWriteW(ref CREDENTIAL cred, int flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredDeleteW(string target, int type, int flags);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
}
"@
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($request.op -eq 'read') {
  $pointer = [IntPtr]::Zero
  if (-not [PaddockCred]::CredReadW($request.target, 1, 0, [ref]$pointer)) { [Console]::Out.Write('{"found":false}'); exit 0 }
  try {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][PaddockCred+CREDENTIAL])
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    if ($cred.CredentialBlobSize -gt 0) { [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize) }
    [Console]::Out.Write((@{ found = $true; user = $cred.UserName; persist = $cred.Persist; blob = [Convert]::ToBase64String($bytes) } | ConvertTo-Json -Compress))
  } finally { [PaddockCred]::CredFree($pointer) }
} elseif ($request.op -eq 'write') {
  $bytes = [Convert]::FromBase64String($request.blob)
  $handle = [Runtime.InteropServices.Marshal]::AllocHGlobal([Math]::Max(1, $bytes.Length))
  try {
    if ($bytes.Length) { [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $handle, $bytes.Length) }
    $cred = New-Object PaddockCred+CREDENTIAL
    $cred.Type = 1; $cred.TargetName = $request.target; $cred.UserName = $request.user; $cred.Persist = [int]$request.persist
    $cred.CredentialBlobSize = $bytes.Length; $cred.CredentialBlob = $handle
    if (-not [PaddockCred]::CredWriteW([ref]$cred, 0)) { throw "CredWrite failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
  } finally { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($handle) }
  [Console]::Out.Write('{"ok":true}')
} elseif ($request.op -eq 'delete') {
  [void][PaddockCred]::CredDeleteW($request.target, 1, 0)
  [Console]::Out.Write('{"ok":true}')
} else { throw 'Unknown operation.' }
`;

function run(request, { spawnProcess = spawn, timeoutMs = 20000 } = {}) {
  if (process.platform !== 'win32' && spawnProcess === spawn) return Promise.reject(new Error('Windows Credential Manager is only available on Windows.'));
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const child = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} reject(new Error('Credential Manager did not answer in time.')); }, timeoutMs);
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      // stderr can echo script lines; never include it or the output in errors.
      if (code !== 0) return reject(new Error('Credential Manager could not be updated.'));
      try { resolve(JSON.parse(out)); } catch { reject(new Error('Credential Manager returned an unreadable answer.')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

// Returns { user, persist, blob: Buffer } or null when the entry does not exist.
async function readCredential(target, options) {
  const value = await run({ op: 'read', target }, options);
  return value.found ? { user: value.user || '', persist: value.persist || 2, blob: Buffer.from(value.blob || '', 'base64') } : null;
}
async function writeCredential(target, { user, persist = 2, blob }, options) {
  await run({ op: 'write', target, user, persist, blob: Buffer.from(blob).toString('base64') }, options);
}
async function deleteCredential(target, options) { await run({ op: 'delete', target }, options); }

module.exports = { readCredential, writeCredential, deleteCredential };

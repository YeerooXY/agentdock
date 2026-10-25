# Reverse Engineer Anything

Open **Tools → Reverse Engineer Anything → Set up REA**. Paddock installs the pinned
`rea-agents` 6.7.0 package locally and connects its stdio MCP server through the
shared bridge. No REA service key is needed. Your agent retains its own model
subscription or API billing. REA and its dependencies retain their installed
license files; [upstream REA](https://github.com/morluto/rea) is MIT licensed.

Paddock does not run `rea setup` or change standalone agent configuration. It uses
its bundled Node/npm, a versioned profile folder, empty npm configuration files
and disabled lifecycle scripts. Additional native modules or analysis providers
may need separate setup. Installation completion is recorded only after a
successful installer exit and matching package/entry-point checks.

Use **Test connection** or **Browse tools** to discover REA's actual tools. Enabled
connections add investigation guidance to `dock_context`; disable or remove the
connection to stop exposing its tools and guidance. Existing consoles consume
updates on their next context refresh. Removing a connection leaves installed
packages, REA state and previously saved results on disk.

Static JavaScript/Electron and .NET inspection needs no native analysis engine.
Native binaries need a provider such as Ghidra, Hopper or IDA, and website
observation needs a Chrome-family browser. Linux process ownership checks need
a working procps-compatible `ps`; Windows Ghidra support has experimental format
limits. Follow [upstream setup](https://github.com/morluto/rea/blob/main/docs/installation.md).
Paddock retains its two-minute MCP timeout; scope long investigations accordingly.

Local analysis results can reach the agent's model provider. Browser evidence
cannot reveal a website's private server implementation or database. Findings
should preserve evidence and unknowns and can be saved in Results. Decompiled
output is not guaranteed to be original source.

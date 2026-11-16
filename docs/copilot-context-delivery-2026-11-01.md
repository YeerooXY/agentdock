# Copilot context delivery

Paddock launches Copilot with a per-console instruction directory through `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` and a per-console MCP configuration through `--additional-mcp-config`. The generated `AGENTS.md` contains shared rules and the linked-project binding. Current project details are retrieved through `dock_context({includeProject:true})`; large topic-specific guides remain available on demand.

Fixed a stale-file defect: project/shared-rule changes previously refreshed `PADDOCK.md` while leaving Copilot's `AGENTS.md` at its launch content. Both files now refresh atomically per file, and the cached summary advances only after both writes succeed. A failed second write can be retried. The active process stays running and receives no synthetic prompt.

Copilot caches instruction files in its active conversation. Updated files become available after a new session or an exit/resume; `/instructions` lists discovered files. See [GitHub's custom-instructions documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions). A successful file write does not prove that a model read or obeyed its contents.

During inspection, the latest managed Copilot launch had a Paddock project binding and context-refresh instructions, but its 4,004-character launch copy lacked the new explicit creative-step paragraph. The running Paddock host still served the previous instruction revision. Restart Paddock to load the updated code. In an existing conversation, the user can explicitly request current project context and the creative guide without sending a test prompt to another console automatically.

For website work, a useful delivery check asks the agent to retrieve the linked project and applicable creative guidance, identify owner exclusions and the selected composition, then compare the first rendered section against that direction. Native subagents may have different inherited context; their handoff must carry those facts explicitly. This change does not claim automatic creative-quality enforcement.

The focused CLI/context/guidance suite passed 32 tests using mocked launches and temporary files, including project replacement, preserved owner rules, second-file write failure recovery, unchanged-file stability, and no extra process or prompt. Full build, unit and headless desktop verification logs are under `artifacts/usage-recovery/copilot-*.log`.

Final verification: build passed; Windows unit suite passed 742 tests with one platform skip; Linux Docker unit and headless desktop suites passed. No provider model request was sent.

The user's running Copilot process was also checked for the reported repeated permission prompts: it had Paddock's MCP configuration but neither `--allow-all` nor `--allow-all-tools`. Paddock's saved `agentPermissions` was `default`. This is independent of instruction delivery. Paddock already maps its Unrestricted launch option to `--allow-all`. The existing session can enable the same mode through `/permissions allow-all`, without replacing the process or chat. [GitHub permission configuration](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/configure-copilot-cli). No global permission defaults were changed.

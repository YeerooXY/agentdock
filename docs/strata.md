# Strata local models

Paddock can launch an OpenCode console using a model served by [Strata](https://github.com/Niko1221/Strata). This connection is optional.

1. Install OpenCode through Paddock's agent setup and install Strata from its [official releases](https://github.com/Niko1221/Strata/releases).
2. Run `strata launch`. Choose a model that fits your hardware and local-only access. Match the server context to the client preset below. Check the download plan before acquiring model files.
3. In **Settings → Tools → Strata**, select **Set up Strata API**. The default endpoint is `http://127.0.0.1:8080/v1/chat/completions`. Match the port to your server and save with **No key**.
4. Hold a console's **+** button to open the console chooser. Select **OpenCode**, then **Strata (local · 256K)**. Choose the project folder and open the console.

Selecting this model creates configuration for that console. Its primary and helper models both use Strata. Paddock's shared tools remain available under their existing permissions. Enabled tools can contact external services.

The current client preset declares a 262,144-token context limit and a 16,384-token output limit, with a 20,000-token compaction buffer. These declarations do not configure the server or establish long-context quality. The client alias is `strata/local`; the server's `/v1/models` endpoint identifies the model actually loaded. Changing Strata's loaded model changes what answers at that address.

## Bounded text assistance

`dock/local_assist` sends one supplied text task directly to the saved local Strata endpoint. It does not launch OpenCode, edit files, start a task/review loop or call another tool. Use it for factual extraction, a small draft, a focused critique or creative screen compositions. Deterministic checks should use scripts.

Required arguments are `requestId`, `purpose` (`extract`, `draft`, `critique`, `creative`) and `prompt`. Optional `maxOutput` is 256–8192 tokens (default 2048); `reasoning` is none/low/medium/high (default none). These are bounded starting settings, not measured quality optima. Supply only the relevant facts and constraints, up to 24,000 characters. The model receives no conversation history or project files automatically.

The helper discovers the loaded model, permits one helper request at a time and stops waiting after 90 seconds. It never retries or switches to a cloud provider. Immediate repeated calls with the same ID and input in the same console/turn reuse the response; the last 128 requests are cached until app restart. Failed and incomplete responses are also reused. Use a new ID only for intentional new work. A timed-out server may continue computing; inspect it before another request.

Usage and duration are recorded in the API ledger with project/turn attribution, including failed or incomplete requests. Missing usage remains unknown. Prompt and answer text are not written to the ledger. No Results or Tasks entry is created. Local inference consumes the machine's resources; the tool makes no monetary-savings claim. It does not reserve capacity against separately launched Strata/OpenCode sessions.

Check facts and code before integration. Keep useful output rather than regenerating the same work in the cloud. Track whether the result was adopted and why in the task's existing verification note. A text-only creative response is an image prompt and composition proposal, not a generated image or an owner-approved design.

The source app must be restarted to expose this new tool. Existing consoles are not restarted automatically. The configured server was unreachable during the 1 November workflow repair; mocked request tests establish protocol behavior, not current model quality.

Paddock starts OpenCode when you open the console. Start and stop the model through Strata. Saving API settings does not install Strata, download weights, start a server, or change your default agent. Removing the saved Strata API removes the model choice from new consoles; it does not stop an existing console or server.

The built-in console preset supports HTTP on localhost without authentication. For an authenticated or remote Strata server, use the [Strata OpenCode connection guide](https://github.com/Niko1221/Strata/blob/main/docs/TERMINAL_LAUNCH.md#connect-your-apps-strata-connect). Paddock does not pass vault credentials to agent-console environments.

## Delegate implementation to the local model

An agent connected to Paddock can use `dock/task_candidates` to discover the optional `opencode:strata` account. It appears when OpenCode is installed and the localhost API profile above is saved; cloud sign-in is unnecessary. Start Strata before assigning work.

The agent can call `dock/start_task` with a concrete title and acceptance criteria, `implementer: { accountId: "opencode:strata", model: "strata/local" }`, the project repository and `workflow: "current"`. It can select a separate reviewer and supply a checks command. A cloud reviewer uses its subscription or API credits. With account discovery enabled, small and medium task suggestions prefer a ready local model. Large planning tasks and custom pools retain their configured routes. Readiness uses a cached, read-only `/v1/models` probe; a saved profile alone is insufficient. Offline or stale local readings are not selected automatically.

Local implementation defaults to one checked round, including newly planned local subtasks. Explicit round settings are preserved. A failed local result is inspected before any follow-up; the runner does not automatically change it to a cloud model. Task status and the existing report separate recorded cloud and local worker attempts, input, output, cached input and unknown counters. Coordinating chat usage is explicitly excluded from these worker totals and must be added for a full comparison.

OpenCode gives the local model file-reading and editing tools. The task runner executes the supplied checks and runs the selected reviewer. Worker shell and web tools remain disabled under the existing task permissions. Both the worker's primary and helper models use Strata, with no cloud-model fallback. Each worker revalidates the saved profile before launching.

The calling agent reads `dock/task_status` with the returned task ID and the same repository to inspect progress, changes and check results. It should wait for the worker before editing those files. Progress also appears in **Tasks**. This connection enables implementation; coding quality and speed depend on the loaded model and require a live trial.

## Verify a local server

```sh
strata launch --status
strata connect opencode --check --output json
```

For the default local port, this repository also provides:

```sh
node scripts/strata-local-smoke.cjs
```

It verifies model discovery, a short text answer, and a tool round trip through Paddock's API runner. The tool is a diagnostic stub; it executes no connected tools. Results are written to `.build/strata-trial/live-check.json`. This check uses brief prompts with reasoning disabled; it is not a coding-quality or throughput benchmark.

## Hardware selection

Use Strata's [current model requirements](https://github.com/Niko1221/Strata/blob/main/docs/MODELS.md) and the installed release's `strata launch --plan` output. Total RAM, currently free RAM, GPU memory and download size measure different constraints. Keep room for your other running apps. A successful install or download does not establish that inference works.

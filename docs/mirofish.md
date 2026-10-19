# MiroFish scenario simulation

MiroFish can rehearse how different audiences might react to a launch, pricing
change or product message. Dock connects it as an optional step after building
and before launch. It is also available for a requested scenario at other stages;
enabling the connection alone starts no simulation.

## How it works

The [upstream project](https://github.com/666ghj/MiroFish) extracts entities and
relationships from supplied documents into a graph, generates agent personas,
simulates interactions through OASIS social environments, and generates a report.
Users can also interview simulated agents. These are synthetic participants,
not a representative sample of actual buyers. Reports suggest hypotheses and
objections to investigate, rather than validated demand or conversion forecasts.

For Agent Dock, examples include comparing a privacy-first launch message with
a productivity-first message, exploring concerns about remote computer access,
or comparing free and paid feature boundaries. Product evidence, real interview
notes and explicit assumptions make more useful seeds than an unsupported idea.

## Connect

1. Set up and start the official MiroFish service using its upstream instructions.
   Current prerequisites are Python 3.11–3.12, Node 18+ and uv, or Docker. Configure
   its LLM endpoint and Zep key in that service. Upstream uses Zep Cloud and is not
   fully offline. The model endpoint accepts the OpenAI SDK format; local model
   compatibility and quality require separate verification.
2. Open **Tools → MiroFish** in Dock. Enter the backend origin, normally
   `http://127.0.0.1:5001`, and choose **Connect MiroFish**. The adapter currently
   accepts loopback HTTP only, without credentials, paths or query strings. The
   frontend's port 3000 is not the backend endpoint.
3. Dock checks `/health` for the MiroFish backend identity without invoking a model.
   **Browse tools** discovers the adapter; its `health` tool checks the service
   again. A connected adapter does not verify model/Zep quota or simulation quality.

The independent adapter is bundled with Dock. MiroFish itself is not installed,
launched or bundled by Dock. Its [upstream license is AGPL-3.0](https://github.com/666ghj/MiroFish/blob/main/LICENSE).
The initial adapter targets the official Flask routes, not third-party forks or
hosted products using the same name. Provider credentials stay with the separate
backend; Dock's agent consoles receive no backend keys.

## Agent workflow

The shared bridge exposes 17 tools for health, project/ontology creation, graph
construction, preparation, bounded simulation, status checks, stopping, reports
and persona interviews. Seed inputs are selected text documents, sent as generated
Markdown uploads; no tool reads arbitrary local paths. At most ten seed documents
and 2 MiB of UTF-8 seed text are accepted per upload. PDF files should be converted
to relevant text by the agent first or uploaded through MiroFish's own interface.

Long operations return IDs to poll rather than holding a Dock turn open. Ontology
generation is synchronous upstream and has a 110-second adapter timeout. A timeout
can leave backend work running: inspect projects and task/run status before retrying.
Responses are bounded to 4 MiB and HTTP redirects are refused. Model work uses the
backend's billing, not Dock's token/cost ledger. The 1–40 round limit is not a hard
token or spending cap. No automatic retries or background simulation are added.

Project context and findings may reach MiroFish's LLM and Zep providers. Start with
a small requested scenario and avoid unrelated or confidential source material.
Save source references, assumptions, external IDs, the report and proposed real-world
experiments with the current Dock project. Repeated runs can explore sensitivity
to assumptions; agreement between model personas does not establish accuracy.

## Local models and subscriptions

The official backend's `LLM_BASE_URL` and `LLM_MODEL_NAME` also reach the simulation
runner, so an OpenAI-compatible local server is a plausible model provider. For
example, a candidate Ollama configuration is:

```env
LLM_BASE_URL=http://127.0.0.1:11434/v1
LLM_API_KEY=ollama
LLM_MODEL_NAME=your-installed-local-model-id
```

Ollama ignores the placeholder key for local requests. Verify structured JSON,
tool calls, context capacity, runtime compatibility and output quality before
using a model for a larger simulation. Personas can share a loaded model; they
do not need one model instance each. The official backend still requires Zep
Cloud. Local inference therefore does not make the whole workflow offline.
Local execution still uses computer time and electricity.

Community forks differ. For example,
[vinculumlabs/mirofish](https://github.com/vinculumlabs/mirofish) implements
`claude-cli` and `codex-cli` providers with local graph storage. It calls the
vendor CLI rather than converting a subscription into an API key. Its code also
contains POSIX-specific assumptions, and its CLI interface is not the official
Flask API used by this adapter. Subscription entitlement, quota, platform support
and end-to-end simulation need separate verification. This is an investigated
option, not an installed or verified Dock provider.

Codex supports ChatGPT sign-in for subscription access and API-key sign-in for
usage-based access; these have separate billing behavior. See the
[official authentication documentation](https://learn.chatgpt.com/docs/auth).
Do not extract saved login tokens or silently fall back to a paid API provider.

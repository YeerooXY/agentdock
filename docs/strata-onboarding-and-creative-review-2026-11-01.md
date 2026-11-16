# Paddock Review: Local Model Onboarding, Allowance Routing, and Creative Gating

**Date:** 2026-11-01  
**Scope:** Paddock MCP runtime, agent task discovery (`dock_context`, `dock/task_candidates`, `dock/setup_status`), and website workflow.  
**Audience:** Paddock core team and active local developer agents.

---

## 1. Executive Summary

During an end-to-end task to create a new web project, several critical usability and agent-behavior gaps were identified in Paddock's console workflow:

1. **Passive Local Inference:** Strata is configured in Paddock (`opencode:strata` at `http://127.0.0.1:8080`), and the host PC possesses a Vulkan-capable discrete GPU. However, Paddock never instructed or prompted the agent to ask the user if they had tried local model generation.
2. **Silent Subscription Exhaustion:** The user's primary accounts (`claude:default` and `codex:default`) had reached 100% of their weekly quotas, while healthy alternative accounts (`kiro:default` at 98.4% and `codex:sub1` at 99%) were available. Paddock recorded these metrics but did not proactively surface them to the user.
3. **Unenforced Creative Guidance:** Paddock’s `dock/website_guide: creative` forbids generic card stacks and uninspired layouts, but agents easily bypass this step and default to sterile, unstyled wireframes unless stopped by an upfront gate.

---

## 2. Current Observed Subscription & Provider State

Paddock's live ledger and candidate probes revealed the following account states:

| Account ID | Provider | Plan | Quota Status | Observation |
| :--- | :--- | :--- | :--- | :--- |
| `claude:default` | Claude Code | Pro | **Blocked (100% weekly used)** | 5-hour window open, weekly exhausted. |
| `codex:default` | Codex | Plus | **Blocked (100% weekly used)** | Exhausted until weekly reset. |
| `cb75b00b...` | Codex · sub1 | Free | **Healthy (99% remaining)** | Immediate fallback capacity. |
| `kiro:default` | Kiro | Free credits | **Healthy (98.42% remaining)** | 49.21 / 50 credits active. Top alternative vendor. |
| `opencode:default` | OpenCode | Free/API | **Healthy (54% remaining)** | 46% weekly used, rolling window clear. |
| `opencode:strata` | Strata | Local | **Offline / Unchecked** | Configured at `127.0.0.1:8080`, unprompted. |

---

## 3. Recommendation 1: Proactive Strata & Local Model Onboarding

### The Problem
If a user has a capable PC with dedicated GPU hardware (evidenced by active tools like `upscayl-local` using Vulkan), Paddock provides no automated onboarding prompt for local inference. The user must independently know that Strata exists, manually install and launch it, and configure it.

### Required Paddock Behavior
When an agent or Paddock session initializes:
1. **Health-check `127.0.0.1:8080`:** If `strata` is in Paddock’s API list and the port is unreachable, the agent should be guided to ask the user at least once:
   > *"I notice your machine has GPU acceleration available and Paddock has a profile for Strata local inference. Have you tried running local code generation on this PC yet? If you'd like to try it, I can recommend a model that fits your hardware and help you launch it."*
2. **Model Recommendations by Hardware Tier:**
   If the user expresses interest, Paddock / the agent should recommend concrete models:
   - **8 GB – 12 GB VRAM / 16 GB RAM:** `Qwen2.5-Coder-7B-Instruct` (Q4_K_M or Q8_0) — fast, responsive for daily edits, fits easily into GPU memory.
   - **16 GB VRAM / 32 GB RAM:** `Qwen2.5-Coder-14B-Instruct` or `DeepSeek-Coder-V2-Lite` — high coding accuracy with full project context.
   - **CPU-only / Low RAM:** `Qwen2.5-Coder-3B` or `Llama-3.2-3B-Instruct` for light assistance.

---

## 4. Recommendation 2: Upfront Quota & Allowance Surfacing

### The Problem
Agents discover quota blockages only when a delegation or task call fails, or if they happen to query `dock/task_candidates`. The user is left in the dark about why an agent might be hesitant to delegate work or running slowly.

### Required Paddock Behavior
- **Initial Turn Summary:** In the first interaction of a tracked project or session, Paddock should provide a concise one-line allowance readout:
  > *"Allowances: Claude (weekly capped), Codex (weekly capped), Kiro (98% left), OpenCode (54% left). Routing recommended to Kiro or Codex sub1."*
- **Automatic Fallback Suggestion:** When a user asks an agent to run an intensive task, the agent should immediately propose routing to healthy accounts instead of silently stalling.

---

## 5. Recommendation 3: Enforceable Creative Direction Gate

### The Problem
`dock/website_guide: creative` contains strong principles:
> *"Produce three short composition ideas before requesting images... Each must change at least two of spatial organization, information order, evidence treatment and interaction... Avoid a stack of interchangeable boxed sections or three equally weighted images without a content reason."*

However, because this is structured as passive documentation rather than an operational gate, LLMs default to standard Vite + Tailwind templates with gray-bordered rounded cards.

### Required Paddock Behavior
In `agent-dock/guides/web-design.md` and root `AGENTS.md`:
- Elevate the creative step to a **blocking pre-requisite**: An agent cannot proceed to file creation (`src/`) without first outputting 2–3 structurally distinct concept options (with differing spatial arrangements, focal points, and color palettes) and receiving user selection.
- Explicitly list the **generic 3-column card stack** as a banned anti-pattern.

---

## 6. Action Items for Paddock Developers & Local Agents

1. [ ] **Update `dock_context`:** Include local server reachable status (`strataOnline: boolean`) in the context object.
2. [ ] **Update `instructions.md`:** Instruct agents to ask about Strata when GPU/Vulkan is detected and Strata is offline.
3. [ ] **Add Model Recommendation Preset in Tools:** Add a "Recommended Local Models" card directly on the Strata tool page in Paddock UI.
4. [ ] **Enforce Creative Gate in `AGENTS.md`:** Add the 4-step website gate directly into root instruction templates.

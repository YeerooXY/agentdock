# Who plans projects in Paddock, and how

Date: 23 October 2026. These six people are **hypothetical**, built from the earlier [target user research](../target-users-research.md) and the [simulated user review](agentdock-simulated-user-review.md). Nobody was interviewed. Treat every "needs" line as a hypothesis to check with real users.

## The six scenarios

### 1. Mia, first-time vibe coder: "a website for my mum's bakery"
- **Setup:** Windows laptop, Claude subscription, no Git, never opened a terminal before Paddock.
- **What she brings:** a few photos of the shop, a menu as a PDF, a competitor site she likes.
- **What she needs from planning:** plain questions, one at a time; somewhere to drop the photos and the PDF so the agent sees them; a short list of steps she can tick off. She will not fill an "infrastructure" form, and words like *stack* or *tradeoff* stop her.
- **Must not happen:** a page of empty boxes; being blocked because "research" is empty.

### 2. Daniel, skeptical senior developer: "add Paddock to an existing repo"
- **Setup:** 10-year-old .NET codebase, Codex and Claude, strong opinions, reads diffs.
- **What he brings:** an existing repository and README, a ticket list.
- **What he needs:** to skip the brief and research entirely and write three milestones with clear done-when checks. He wants to see exactly what an agent changed in the plan before accepting it. He distrusts anything that looks like the tool deciding for him.
- **Must not happen:** forced ordering; proposals that silently overwrite his text.

### 3. Lena, hobby game developer: "a small Unity action game"
- **Setup:** Unity, Blender connected through Paddock tools, Claude, mostly visual work.
- **What she brings:** mood boards, concept screenshots, reference games with links.
- **What she needs:** a visual reference board that stays next to the plan; milestones like "first playable level" with a screenshot as proof; research as links with notes, not essays.
- **Must not happen:** references buried in a chat; text-only planning for a visual project.

### 4. Arjun, student: "final-year assignment with a deadline"
- **Setup:** university laptop, free tiers only (Copilot Free, Antigravity), a marking rubric PDF.
- **What he brings:** the assignment brief and rubric, a due date.
- **What he needs:** the rubric turned into milestones with done-when checks; a visible date; honesty about what is verified. No hosting, no market research.
- **Must not happen:** sections he cannot answer ("audience", "niche") blocking him.

### 5. Sofia, freelancer: "client landing page"
- **Setup:** works for clients, several projects at once, needs to show progress.
- **What she brings:** the client's brief, brand assets, a fixed price.
- **What she needs:** a plan she can export or share as a readable page; a scope that says what is *not* included; later features kept apart from the agreed work so scope creep is visible.
- **Must not happen:** scope changes that nobody approved.

### 6. Yeeroo, power user: "Paddock itself"
- **Setup:** many consoles, Android phone, a Linux VM, several agents working at once.
- **What they bring:** an evolving project with notes from many chats.
- **What they need:** to approve a roadmap without filling unrelated sections; proposals per section so agents do not block each other; milestone progress that matches verified work; the plan reachable from the phone.
- **Must not happen:** the current dead end (roadmap proposal waiting, earlier sections empty, approval refused).

## What the scenarios have in common

| Need | Who | Design consequence |
| --- | --- | --- |
| Skip what does not apply | All six | Sections are independent. Each can be marked **Not needed**. Only the roadmap is required to start work. |
| Start from material, not forms | Mia, Lena, Arjun, Sofia | A **reference board** (screenshots, files, links) in the left column, visible while planning and readable by agents. |
| One question at a time for beginners | Mia, Arjun | **Guided** mode asks questions in the conversation and fills the plan; **Edit** mode shows fields for people like Daniel. |
| See exactly what an agent changed | Daniel, Sofia, Yeeroo | Proposals show per-field before/after with Accept, Edit and Reject. One proposal per section. |
| Milestones with proof | Lena, Arjun, Yeeroo | Milestones are a real list: title, done-when, and an optional link to the Result that proves it. |
| Scope boundaries | Sofia, Yeeroo | Scope has "Included" and "Not included"; Later features sit beside it. |
| Fewer, clearer fields | Mia, Arjun | Brief 3 fields, Research 3, Setup 4, Roadmap 2 + list. Empty optional fields collapse to a single "Add…" line instead of an empty box. |

## Proposed structure

- **Plan becomes a full page**, not a dialog. Left column: sections with status (Approved, Proposal waiting, Not needed, Not started) and the **reference board**. Main column: the selected section as a readable summary with **Edit**, or the proposal diff.
- **Sections:** Brief (goal, who it's for, success), Research (similar apps with links, our angle, open questions), Setup (tools and why, where it runs and cost, data and security, testing and backups), Roadmap (included / not included, milestones list).
- **Approval:** each section on its own. Approving the roadmap activates the project; unapproved sections show as notes on the roadmap, never as a refusal.

Open questions for real users: whether beginners understand "Not needed"; whether the reference board should also appear on the phone; whether Daniel-type users want the plan as files in the repository instead.

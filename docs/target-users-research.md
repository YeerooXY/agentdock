# Who Paddock should serve first

Research date: 19 October 2026. Recommendation for discussion, not an approved expansion of the roadmap. Sources describe their own products or users' experiences; competing applications were not installed or penetration-tested.

## Recommended first audience

Independent developers and technically comfortable makers who already use coding-agent CLIs, have several active projects, and want to check work from an Android phone. Windows users are the practical first group because that is Paddock's supported host today.

Their main job: **Start work in the right project, see what needs attention, review the actual changes, and continue from another device.**

This is a provisional audience recommendation. Public issues give useful evidence of these problems, but do not measure market size, willingness to switch, or willingness to pay. The Windows emphasis comes from Paddock's current implementation, not a representative market survey.

| Group | Fit now | What they would need |
| --- | --- | --- |
| Independent developers using several agent CLIs | Best initial fit | Reliable sessions, clear project identity, reviewable diffs and test evidence, easy device switching |
| Technical makers with a home workstation or VM | Good adjacent group | Host naming, secure remote access, SSH, recovery after network changes, low idle consumption |
| Small studios and freelancers producing games or websites | Worth testing | Screenshots and assets beside code changes, project standards, repeatable handoff; demand for this combination remains unvalidated |
| Beginners starting their first application | Later | A bounded planning conversation, understandable failures, safe defaults, guided setup; networking and review are still substantial barriers |
| Teams needing enterprise controls | Later | Separate identities, project permissions, audited approvals, SSO and administration; pairing currently grants broad control |

## What users actually asked for

These are independent public reports, not interviews conducted for Paddock. Closed or improved issues are evidence of a user need, not proof of a current competitor defect. Quotations are limited to brief excerpts.

| Evidence and date | Need | Status and confidence |
| --- | --- | --- |
| [Vibe Kanban #1417](https://github.com/BloopAI/vibe-kanban/issues/1417), 3 Dec 2025: an independent developer described switching repeatedly among several projects to understand progress. | An overview of running work and items needing review, with project filters. | Maintainer reported support in February 2026. Medium confidence in demand; already addressed by that competitor. |
| [Vibe Kanban #2687](https://github.com/BloopAI/vibe-kanban/issues/2687), February 2026: users described repeated repository selection, confusing return navigation and concern about cloud dependencies. Others wanted stronger separation between projects. | Remember project/repository bindings; provide both a focused project view and an optional global overview. | Historical workflow feedback. Medium confidence; preferences conflict, so one compulsory combined view is a poor answer. |
| [Vibe Kanban #2300](https://github.com/BloopAI/vibe-kanban/issues/2300), Jan–Mar 2026: users prioritized visible diffs and review controls over chat logs and reported mobile regressions. The author later reported improvement. | Put evidence and the review action within easy reach; preserve view preferences. | Improved by March according to the author. Medium confidence in the need, not a current defect claim. |
| [Happy #1308](https://github.com/slopus/happy/issues/1308), 19 May 2026: a report describes missed updates after backgrounding and completion/permission alerts suppressed by incorrect presence detection. | Notify when a person is needed, and catch up reliably after backgrounding. | Reported issue; no independent reproduction here. Medium confidence alongside the next connection report. |
| [Paseo #3842](https://github.com/getpaseo/paseo/issues/3842), Aug–Sep 2026: users documented apparently connected sessions that stopped updating. A maintainer later described a resume check and remaining network-change limitations. | Honest connection status, fast recovery, no duplicate submissions. | Resume fix reported for a September prerelease; other paths remained discussed. Medium confidence; version-specific. |
| [Paseo #2103](https://github.com/getpaseo/paseo/issues/2103), 16 July 2026: multiple users reported an update preventing desktop startup. | Test the packaged release; provide an update/recovery path that works when the main connection is broken. | Maintainer reported a fix in 0.1.109 and manual upgrade instructions. High confidence in this historical incident; not a current defect claim. |

An independent research paper, [Professional Software Developers Don't Vibe, They Control](https://arxiv.org/abs/2512.14012), also examines developers' use of agent control and review. It supports investigating human oversight; it does not validate demand for Paddock specifically.

## What competitors already provide

| Tool | Documented strengths | Implication for Paddock |
| --- | --- | --- |
| [Paseo](https://github.com/getpaseo/paseo) | Desktop/mobile/web clients, multiple hosts and providers, worktrees, terminals, diffs, review and a server mode for VMs. | Multi-agent remote control is established functionality. Paddock needs a smaller workflow it performs reliably, not a longer feature list. |
| [Happier](https://docs.happier.dev/) | Agents on users' machines, encrypted session synchronization, mobile control, review, machines, MCP and self-hosting. | Provider choice, privacy and self-hosting alone do not distinguish Paddock. Compare setup effort and review clarity with real users. |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Issue planning, agent workspaces, inline diff comments, previews and pull requests. | Review feedback should remain attached to the work. Its [shutdown announcement](https://www.vibekanban.com/blog/shutdown) also illustrates why portability and maintainability matter; community continuation is described, so do not call the code unavailable. |

These are documented capabilities, not a claim that every workflow is bug-free. GitHub stars and repository activity are not customer counts.

## The opportunity to validate

Paddock can focus on a complete review handoff: **project → turn → code changes, images and test evidence → user feedback → verified revision**. Keep the actual terminal available, keep project instructions portable, and make the same work easy to find on a phone.

The gap is not that other tools lack all these parts. Public feedback suggests that users lose time when the parts are unreliable, poorly connected or require repeated setup. Whether Paddock's particular combination is enough to make people switch remains an open question.

Recommended priorities, using what already exists:

1. **Reliability and trust:** finish the named-device release; retain pairings, show the active host, prevent stale input, and keep security regressions reproducible. Existing terminals and Results should survive updates and connection loss.
2. **Review by project and turn:** build on the existing gallery/diff capture. Give each turn a clear outcome, evidence, review comments and explicit acceptance. Do not count an agent saying “done” as passing a test.
3. **Remember context:** keep the project, folder and standards bound to the console; carry unresolved feedback into the next turn without duplicating old comments. Verify current implementations before extending them.
4. **VM access:** introduce a saved host and a provider chooser for that host after choosing the first supported VM transport. Use established SSH and host-key verification for a Linux connection; avoid a new public shell protocol.
5. **Attention management:** a cross-project list of decisions, failures and finished work, with an easy return to the original project. Preserve a focused single-project view.
6. **Usage honesty:** make existing subscription readings and API estimates understandable. Project attribution is useful; exact per-message subscription pricing is generally unavailable and must not be invented.

Postpone a workflow marketplace, broad business-management suite, autonomous agent hierarchy, hosted relay service and elaborate productivity scores. They add maintenance or operating costs before this audience has validated the core flow.

## A small validation study

Recruit six to eight independent developers already using at least two coding projects; include Windows/Android users and people using more than one agent. This is a proposed study, not completed research. No outreach has been sent.

Ask each person to show their last real workflow: where they lost context, how they checked completion, what failed when away from the desk, and what they currently use. Avoid leading with Paddock's planned features.

Then observe five tasks: install and pair; start a task in the correct project; switch computers without pairing again; review a turn's diff and screenshot; resume after a network interruption. Record completion, time, mistakes, recovery steps and whether they would use Paddock for an actual project the following week. Targets should be agreed before testing, not presented as measured results.

Decisions after that study: whether mobile review is frequent enough to justify priority, whether users prefer direct access or an optional relay, how often they need VMs, and whether the project/turn evidence view is meaningfully better than their existing workflow.

## VM boundaries in this release

A Windows VM running Paddock can be paired like another PC once its address is reachable. A bridged adapter or forwarding through the host may be needed; do not expose the hypervisor's management interface. Phones receive terminal updates and requested Results, not a video of the desktop.

This release does not add a Linux SSH launcher, a desktop remote-host picker, or a per-host mobile AI chooser. Desktop VM use is through its normal VM console or existing remote-desktop access. Android's new-console action still uses the selected host's configured default. The saved-device tests use two isolated Windows processes; they are not a real hypervisor/network deployment test.

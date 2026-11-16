# Optional engineering skill packs

Installed locally on 6 November 2026 through Paddock's existing SkillPacks
manager. These profile packs are optional and are not new MCP servers.

The Engineering skills group contains four choices: bundled Project
documentation, pstack, Ponytail and Thermo-Nuclear Code Quality Review.
Project documentation is included with Paddock and needs no download. It supports
managed Knowledge and a standalone numbered file protocol; installing it does
not enable upkeep or override Knowledge Off. Existing owner and adopted docs
remain protected. The three downloaded packages have native-CLI fallback
instructions, so their use does not require Paddock to be running.

The table below lists the external sources; the documentation skill is maintained
in `skills/project-documentation` in this repository.

| Pack | Upstream | Pinned commit |
| --- | --- | --- |
| pstack | https://github.com/cursor/plugins/tree/main/pstack | 2776ddd2355d6d6c8747d3964600f28daf62f049 |
| Ponytail | https://github.com/DietrichGebert/ponytail | 96608e078b2d5ea607c5c3b8b5a54d1c1fba6846 |
| Thermo-Nuclear Code Quality Review | https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review | 2776ddd2355d6d6c8747d3964600f28daf62f049 |

The local sources live under `%APPDATA%/Paddock/skill-packs`. Each contains a
short Paddock entry skill, preserved upstream files, upstream license and
SOURCE.json with file hashes. Pstack includes its skill/reference tree, not an
automatic provider-plugin installation. Ponytail includes its supporting text
skills. No lifecycle hooks, dashboards, servers, paid fallback or auto-update
were registered. Host-specific functions may remain unavailable; the entry
skill instructs agents to report them and retain Paddock routing and scope.

Each pack was installed into the shared agent directory and the six applicable
provider-specific directories. Existing unmanaged files remain protected by the
manager. The installation manifests allow Paddock to remove unchanged installed
files while preserving user changes. ManagedDownloads records source locations
for cleanup. These local packs do not ship to other users in a release.

The follow-up catalog makes these three identities visible on a fresh profile
without downloading during discovery. One install action downloads a pinned
archive, validates it, prepares a Paddock entry skill and installs into applicable
agent folders. Downloading and setup belong to the same busy operation.
Concurrent changes are rejected; failed downloads leave target folders untouched.
Existing local/bundled packs retain precedence, and edited/unmanaged target
folders remain protected.

The shared entry skill uses Paddock routing rather than upstream model defaults.
Installing these skills needs no API key. Agent sign-in remains separate;
installing a skill does not grant model entitlement. Provider-plugin hooks,
dashboards and provider-specific automations are outside this skill-pack setup.
Setup details are visible before installation. Providers that scan skills at
startup require a new session after installation.

Each installed pack has a global **Use automatically** switch in Tools. The four
engineering packs start in manual mode; the two bundled UI packs retain their
automatic default. Manual packs remain available when explicitly requested.
Automatic use follows task scope: pstack for planning, Ponytail for implementation,
and Thermo-Nuclear for review. The coordinating agent receives their triggers and
absolute entry paths. No project name is part of this policy.

Paddock resolves the setting again for each worker dispatch. Workers receive the
root and primary upstream instructions inline, including a revision and digest,
so their existing filesystem restrictions stay intact. Delivery is bounded to
32 KiB per pack and 48 KiB total, with at most five applicable packs. Oversize,
missing and modified installs are reported unavailable rather than truncated.
Agents without a file reader can use the read-only `dock/skill_guide` tool for
bounded installed Markdown. Knowledge Off suppresses project-documentation;
installing or enabling the skill never enables maintenance or model spending.

In installed copies, nested upstream entry files become `SKILL.upstream.md`,
with relative Markdown links repaired. Only the root remains discoverable as
`SKILL.md`; the downloaded source stays unchanged. Changing the switch refreshes
existing managed copies without downloading or installing new targets. Modified
and unrelated copies are preserved and reported. Native agents may still load
those preserved copies under their previous policy. Promotion failure restores
the previous copy, or reports the retained backup if restoration also fails.

Normal startup also upgrades unchanged managed copies to the current adapter
format, preserving saved manual/automatic choices. It creates no new installs
and downloads nothing. Safe mode and temporary startup preflight leave the
real skill folders untouched. An outdated guide reports “Run Update in Tools”;
changed and conflicting copies have separate recovery messages.

Existing consoles receive changed instructions on their next context refresh;
native discovery may require a new session. Previously delivered instructions
cannot be recalled. A switch supplies instructions, not a guarantee of model
compliance or permission to invoke models, tools, installers or unrelated fixes.

Skill cards are now rendered in Tools as well as Instructions. Existing install,
uninstall and refresh actions are reused. Refresh and removed-button focus fall
back to the refresh control. Decorative middle-dot separators in the touched
skill-card metadata were removed. No broader UI redesign was performed.

Installation evidence: `.build/skill-module-import/setup-result.json`. All seven
applicable target locations have the configured adapters. Fresh-profile proof
for all three pinned archives: `fresh-profile-verification.json`; a real HTTPS
Ponytail install: `live-download-verification.json`, in the same directory.
Those checks used isolated homes and made no model requests.

Build passed; the latest documentation/group/pilot unit run passed 1,223 tests
with one platform skip. Installer-focused coverage includes the deadline, path
and stream-cleanup regressions. Upstream hashes verified for 573 pstack files,
seven Ponytail files and one Thermo-Nuclear skill file. The generic skill-creator
validator rejects the host-specific disable-model-invocation frontmatter field;
the packs retain that explicit-invocation flag, also used by upstream Cursor
skills. This is a validator compatibility limitation, not a claimed validation
pass. Native standalone Claude trials have now exercised the selected skills;
see [the pilot report](standalone-skill-pilot-2026-11-06.md). Other providers and
real-repository lifecycle comparisons remain unverified.

One native Antigravity implementation worker delivered the backend/fixtures but
could not execute commands in its provider environment. Lead integration fixed
concrete defects and ran the checks. One focused Sonnet review identified the
overall download deadline and Windows file-handle cleanup issues; both were
corrected and regression-tested. No duplicate review/fix loop was dispatched.
Local inference was offline. Usage is recorded in one-click-usage.json in the
verification directory; no cost-savings claim.

At the initial installation, the headless desktop command could not connect to Docker's stopped Linux
engine. Its new catalog-button, setup-details and focus assertions remain
unverified in Electron. No visible test window was opened as a fallback.

The running app can discover these profile packs through Instructions, Skill
packs, Check again. The new Tools placement requires loading the updated renderer
on a normal app restart; no restart was authorized or scheduled for this change.

Available connection snapshot: Meshy, REA and local Upscayl connected; Blender,
Unity and MiroFish require setup. Other recommended catalog entries include
Playwright, Chrome DevTools, Context7, Notion, Stripe and GitHub; a catalog entry
does not establish an active connection or entitlement.

## Study skills

On 8 November 2026 the catalog gained `latex-document` from
https://github.com/happycapy-ai/Happycapy-skills (MIT, pinned commit
9ff72feaf2f200f81fa4557d021414f73d12ab28). It appears under **Study skills** in
Tools and installs through the same download action, adding about 19 MB.
It is a lead-only pack and **Use automatically** is on by default, so study
consoles can create notes, cheat sheets, exams and PDF-to-LaTeX conversions
when asked. Compiling needs a LaTeX engine on the PC (MiKTeX or Tectonic);
Paddock does not install one, and the upstream `setup.sh` covers Linux and macOS
only. Its upstream `SKILL.md` is 32,719 bytes, so with the root adapter it
exceeds the 32 KiB inline worker limit and is reported unavailable to workers.

The archive contains an unrelated skill with a symlink. Entry validation now
applies only to entries inside the selected prefix; entries outside it are
never written.

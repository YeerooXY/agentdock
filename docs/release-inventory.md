# Paddock release check: inventory and proposed cases

Draft for review, 27 October 2026. Trim, add or reword cases before the walk.

Status key: **Not seen** · **Looks good** · **Needs work** · **Cut**

## How the walk runs

- **Desktop app:** headless, with test data and no windows on your screen. It is checked as a normal window on PC (Chromium) and Mac (Safari engine), and as a narrow window. Mac is emulated, not a real Mac.
- **Phone app:** the native Android app runs in the Android emulator on this PC. There is no iPhone app yet, so iPhone checks apply to web pages such as the Paddock website, not to the app.
- **Every screen also gets:** overflow, contrast and label checks, error capture, and keyboard-only use where it applies.
- **Cases that apply to every item unless noted:** first time/empty, a lot of data, very long names/paths, an error or offline state, two themes (default and one light/bright theme), and reduced motion.

---

## Desktop app

### 1. First launch

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 1.1 | Setup wizard | First-run steps: pick agents and optional tools | No agents installed; all agents installed; install in progress; skip everything | Not seen |
| 1.2 | Updates | Checks for and installs new Paddock versions | Up to date; update available; download fails; offline | Not seen |

### 2. Consoles

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 2.1 | Console grid | The main page of agent consoles | 0 consoles; 1; all 9 slots full; mixed sizes | Not seen |
| 2.2 | New console and agent chooser | Pick an agent and account; recently used first | No agents; many accounts; account near its limit; stale usage | Not seen |
| 2.3 | Console header | Name, status, folder, font size, colour, expand, close | Very long name; every status (working, ready, needs you, error, ended) | Not seen |
| 2.4 | Console colours/appearance | Per-console trim and colours | Every trim style; reset | Not seen |
| 2.5 | Move and resize | Drag consoles between slots, resize across slots | Drag onto an occupied slot; tiny window | Not seen |
| 2.6 | Message queue | Messages sent one by one when a turn ends | Empty; 20 queued; paused; edit/reorder/remove | Not seen |
| 2.7 | Project suggestion banner | "Add this console to a project?" | Dismiss; Don't ask again; long name | Not seen |
| 2.8 | Agent setup requests | Agents asking you to configure a tool | None; several; a key needed | Not seen |
| 2.9 | Latest screenshot spot | Paste your newest screenshot into a console | No screenshot; WSL console; SSH console (refused) | Not seen |
| 2.10 | Clickable file paths and preview | Click a path in a console to preview the file | Text, Markdown, image, folder, binary, too large, missing | Not seen |
| 2.11 | Code panel | Read-only code, changes and diff | No changes; 100 changed files; huge file; private files hidden | Not seen |
| 2.12 | Ask agent (new) | Select code, ask a console about it | File changed since selection; target closed; queue while busy | Not seen |
| 2.13 | Preview panel | Shows a local web server inside Paddock | Server not running; wrong port; phone width | Not seen |
| 2.14 | SSH hosts and remote consoles | Linux machines over SSH | New host key; changed host key; host offline | Not seen |
| 2.15 | Fullscreen (F11), corner HUD, tray | Window modes | F11 with an expanded console; HUD with alerts | Not seen |
| 2.16 | Keyboard page shortcuts | Vim-style page keys | Every key; while typing in a console (must not trigger) | Not seen |
| 2.17 | Explorer (new) | File tree beside the consoles; opens files read-only | Project root; folder expanded; filter; narrow-window drawer; unlinked console | Not seen |

### 3. Projects

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 3.1 | Project list | Your projects with status and next step | None; 30 projects; long goals text | Not seen |
| 3.2 | Project details/edit | Goals, folders, milestones | No folders; 10 milestones; all done | Not seen |
| 3.3 | Plan sheet | Sections, proposals with before/after, approvals | Empty plan; a waiting proposal; "Not needed" sections | Not seen |
| 3.4 | Reference board | Files, links and screenshots for a plan | 50 files; broken link; drag and drop | Not seen |

### 4. Results

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 4.1 | Results gallery | Files agents saved, grouped by chat and prompt | Empty; 200 results; images, Markdown, code, ZIP | Not seen |
| 4.2 | Result preview | Open one result | Large image; long report; deleted file | Not seen |
| 4.3 | Website reviews | Agent page reviews with checklist | Running; finished with findings; interrupted | Not seen |

### 5. Usage

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 5.1 | Account limits | Subscription windows per account | Unknown; stale; nearly full; many accounts | **Needs work** (layout; you use this page often) |
| 5.2 | Request ledger | API requests made through Paddock | Empty; 1,000 rows | Needs work (layout) |
| 5.3 | Cross-agent reviews (new) | Let agents ask another agent for a review | Off; on; running; failed; stopped | Not seen |

### 7. Settings

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 7.1 | General | App behaviour, unrestricted access switch | Every switch on/off | Not seen |
| 7.2 | Appearance | Themes, lighting, stars, openings, textures | All 11 themes; every lighting mode; reduced motion | Not seen |
| 7.3 | Consoles | Console defaults and fonts | Odd fonts; huge/tiny size | Not seen |
| 7.4 | Devices and phone setup | Pair a phone over Tailscale (with the animation) | No Tailscale; found; waiting; connected; revoked phone | Not seen |
| 7.5 | API | Model API settings | No key; invalid key | Not seen |
| 7.6 | Tools | Tool cards, MCP connections, keys, image generator | Key missing; key saved; tool failing | Not seen |
| 7.7 | Instructions | Shared instructions for agents | Empty; very long | Not seen |

### 8. Alerts

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 8.1 | Toasts and completion alerts | "Ready", "needs you" and error messages | Many at once; click opens the right console/result | Not seen |

---

## Phone app (Android)

| # | Item | What it is | Extra cases | Status |
|---|---|---|---|---|
| 9.1 | Pair with a PC | Scan a QR code or enter a code | Camera denied; wrong code; PC offline | Not seen |
| 9.2 | Saved PCs and connection | Choose and reconnect to a PC | Two PCs; Tailscale off; old Wi-Fi setup notice | Not seen |
| 9.3 | Console view | Read and type into a PC console | Long answers; wide tables/rules; links; terminal keys | Not seen |
| 9.4 | Console switcher | Move between consoles | 1 console; 9 consoles; console ended | Not seen |
| 9.5 | New console | Start an agent console from the phone | No agents; many accounts | Not seen |
| 9.6 | Agent menu | Model, effort, account switch | Model list unavailable; switch while busy | Not seen |
| 9.7 | Message queue and drafts | Queue messages, keep drafts | 20 queued; interrupted send (no replay) | Not seen |
| 9.8 | Results | Saved results on the phone | Empty; images; long reports | Not seen |
| 9.9 | Settings and themes | Phone appearance and preferences | All themes; lighting; stars; openings | Not seen |
| 9.10 | PC settings and devices | Manage the PC and paired phones | Revoke this phone | Not seen |
| 9.11 | Updates | App update check and install | Update available; same version; download fails | Not seen |
| 9.12 | Code reader (new) | Read project files; long-press lines to add them to a console draft | Long lines; deep folders; large text; private files; remote console | Not seen |
| 9.13 | Rename and project link (new) | Rename a running console or link it to a project | Archived project; console changed meanwhile; old PC version | Not seen |

Every phone item is also checked: small phone (360 px), large phone, larger text size, landscape.

---

## Questions for you

1. Are there cases you want added? For example, real usage patterns such as "five agents finishing at once".
2. Is anything here already something you would cut without looking?
3. For themes, should every screen be checked in all 11 themes, or in two (default plus one bright)?

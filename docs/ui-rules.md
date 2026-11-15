# Deterministic interface rules

Script checks for interface problems that an LLM judge would otherwise have to notice. They run without model calls. Each finding names the rule, the element or file location and a threshold. Findings are warnings until a project turns them into gates (planned step 3).

## Rendered checks (`electron/ui-rules.cjs`, every browser profile)

Run before the review disables animations, so motion is measured as shipped.

| Rule | Detects | Threshold |
| --- | --- | --- |
| `nested-boxes` | Visible bordered, outlined or ringed boxes stacked inside each other | 3 or more levels |
| `unanimated-controls` | Buttons, links, tabs and inputs with no transition or animation | any |
| `unanimated-overlays` | Dialogs, popovers and menus that appear with no transition or animation | any |
| `selectable-controls` | Text inside buttons, labels, tabs, menus, navigation and toolbars that the user can highlight | any |
| `touching-text` | Neighbouring text elements with no gap, such as "Choose songsOne song" | gap under 1.5 px on the same line |
| `sibling-layout` | Elements sharing a class and parent whose content stacks differently | any difference |
| `chrome-share` | Viewport height taken by fixed or sticky bars, or outside the main scroll area | over 35% |
| `covered-content` | After scrolling to the end, the last content is still under a fixed bar | any |
| `input-style-outliers` | Text fields whose border, radius, background or font size differ from the most common field style | any |
| `mixed-tooltips` | Native `title` tooltips used alongside custom tooltips | both present |

## Interaction checks (desktop Chromium)

| Rule | Detects | Threshold |
| --- | --- | --- |
| `focus-lost` | Tab moves focus to the page body | any, within 40 Tab presses |
| `no-focus-indicator` | A keyboard-focused control looks the same as when it is not focused | any |
| `mouse-focus-ring` | A focus ring appears after pressing a button with the mouse | any of the first 12 visible buttons |

The mouse check presses and moves away before releasing, so no click fires.

## Source checks (`electron/ui-source-rules.cjs`)

| Rule | Detects | Threshold |
| --- | --- | --- |
| `focus-without-visible` | A `:focus` rule that draws an outline or shadow without `:focus-visible` | any |
| `small-font` | Font sizes below 12 px (0.75 rem/em) | under 12 px |
| `reduced-motion-missing` | A stylesheet with transitions or animations and no `prefers-reduced-motion` block | any |
| `window-min-size` | An Electron `BrowserWindow` or MAUI `Window` created without a minimum width and height | any |

Run against a project: `node scripts/ui-rules.cjs <project-root> [url]`.

## Planned

- Step 2b: dialog open, Escape and return-focus scenarios declared per project, and a stable way to load native-app screens (a served fixture) so rendered checks can run without hand-built HTML.
- Step 3: run on file change at idle priority, alongside documentation upkeep, and fail tasks on gated rules. Per-project allowlist entries need a written reason.
- Step 4: screenshot comparison against the last approved capture.

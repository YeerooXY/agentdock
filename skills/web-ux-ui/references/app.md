# Application interfaces

Use this topic for desktop utilities, Electron apps, mobile apps, internal tools, dashboards and game menus. Preserve an established visual direction. Small changes to existing screens keep their scope. For a new app or substantial visual redesign, read creative and present three compositions before building; follow the owner's selection and preview settings.

## Starting design

Start from the user's main task and real content. When no brand is supplied, propose a compact product frame: sidebar or top navigation, a clear content area, and a status or player bar only when the task needs one. A media-library layout is a useful reference for persistent navigation, searchable collections and a current-item panel; adapt it to the product's task. Keep navigation, tools and primary content visually distinct. Avoid stacking every action and section into one undifferentiated column.

A custom title bar should read as part of the window frame. Give it the frame color, not a separate strip, and no divider line; separate it from content by placing pages and panels on inset, rounded surfaces one step lighter, with a consistent gap. Put a frequent action in its center (search or switching) at the same height and shape as neighbouring controls; leave the remaining space draggable. In dense toolbars, group controls by purpose: keep the primary actions apart, let secondary tools recede until hover or focus (always visible on touch), and drop labels that repeat a default, such as the default account name.

Define semantic CSS variables for background, surface, raised surface, text, muted text, border, accent, focus, danger and success. Supply dark and light theme values, use the platform preference initially, and preserve an explicit theme choice. Use one deliberate font stack, one type scale, a spacing scale such as 4/8/12/16/24/32, and one consistent icon family. System fonts are suitable when typography, hierarchy and spacing are intentional. Check contrast in both themes.

## Screens and states

- Lists: readable row hierarchy, selection, search and clear item actions.
- Cards: use for items with distinct media or summaries; keep useful comparison data aligned.
- Dense tables: semantic headers, legible columns, sorting state and horizontal scrolling where needed. Preserve row identity when filtering.
- Settings: group related choices, label controls, expose saved/unsaved state and show necessary consequences next to the action.
- Empty: name the missing content and offer the next useful action. Loading: preserve layout and label waiting controls. Error: keep user input and give a recovery action. Completed: show the resulting state and relevant next action.

## Interaction and verification

Use native semantic controls with deliberate visual treatment, visible focus and accessible names. Verify Tab, Shift+Tab, Enter, Space and Escape where relevant. Preserve focus after updates; when removing a control, focus its logical successor. Keep selection, unsaved edits and scroll position through ordinary updates.

Resize the window through the supported minimum size and desktop widths; check long labels, zoom and dense content. Mobile applications need appropriate safe areas and touch targets. Respect reduced motion. Use verification for Chromium desktop, WebKit desktop, Android Chrome and iPhone WebKit emulation; keep physical-device and native-shell integration checks explicit. A dev-server review covers rendered HTML; it cannot prove Electron IPC, OS dialogs or native mobile behavior.

The automated unstyled findings are inspection hints. Intentional editorial serif text, default-style links and native form controls can be valid choices; review the complete screen before changing them.

The review also inventories visible text's font stacks, sizes and weights. It flags more than 3 stacks, 8 sizes or 5 weights as typography review hints. Inspect deliberate code fonts, branding and data-density needs before changing them. The issue summary counts unique rules across profiles and lists the affected profiles; it preserves per-profile measurements and accessibility nodes.

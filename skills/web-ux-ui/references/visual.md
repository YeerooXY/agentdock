# Color, type, motion and waiting

## Color and typography

Define roles: canvas, raised surface, primary/secondary text, border, primary action, focus, success, warning and error. Choose hues from the brand and content; measure actual combinations. A color's name does not predict trust or purchases. Provide text/icons alongside meaningful status colors.

WCAG AA generally requires 4.5:1 text contrast, or 3:1 for qualifying large text. Applicable control/state information needs 3:1 against adjacent colors. Test every used state and background; don't round a failing value up. Decorative borders and disabled controls have different applicability.

Start with one font family; add a second for a distinct role. This is a practical default, not a standards limit. Code and language fallbacks may need additional fonts. Choose readable shapes, available weights, language coverage and a verified license. Self-host compact font files where appropriate, reserve space and use a considered loading strategy. Check real fallback wrapping, font scaling and actual operating-system rendering.

When offering dark and light themes, define semantic colors for both and check every surrounding control, disclosure, footer and error state. Preserve the original colors of real product media. Apply a saved theme before first paint, and switch text and surface colors together so hover transitions cannot produce a dark-on-dark flash. Store only explicit display choices, document the local preference and support blocked storage.

Keep a gradient button's background image stable during hover and press. Animate a modest overlay, border or shadow; verify entry, exit, press and keyboard focus on touch and pointer devices.

Use consistent SVG icons where shape matters. Emoji presentation varies by platform; never make a color emoji the only label or assume iOS matches Android.

## Motion and pointers

Use short motion to acknowledge input, explain state changes or demonstrate meaningful behavior. Essential content and actions must work with reduced motion. Avoid entrance animations that hide content until JavaScript runs, scroll interception and continuous background effects that compete with reading. Automatic movement may need pause/stop controls under WCAG; interaction animation reduction is a separate criterion.

For an automatically moving logo carousel, provide a persistent keyboard-operable pause control, pause on hover where available, and show a static readable list with reduced motion. Hide duplicated items from assistive technology. Do not place essential task content only inside an auto-advancing carousel.

For requested continuous decorative backgrounds, offer a persistent motion switch in an appropriate appearance control, respect reduced motion and stop work in hidden tabs. Keep decoration visible where intended while scrolling, below content and outside hit testing. Slow, staggered opacity changes can create a star effect with lightweight SVG masks; inspect reading contrast in both themes and use static decoration when controls are unavailable.

Keep native cursors for normal browsing and purchasing. A specialized canvas may justify a crosshair or brush outline. Preserve the actual hit target and keep the function usable by keyboard and touch.

## Loading and failure

Show feedback for real waiting, never a forced branded delay. Use determinate progress only when the denominator is known. Use a concise indeterminate status when duration is unknown; use skeletons when the final structure is known and placeholders help orientation. Reserve space. Keep existing usable content visible during refresh. Announce significant outcomes without repeated screen-reader interruptions.

Retain valid form input after failure. State what happened and a recovery action. Preserve user choices when retrying. A spinner is not a recovery path.

Sources: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [font practices](https://web.dev/articles/font-best-practices), [animation performance](https://web.dev/articles/animations-guide). Recheck current browser support when applying techniques.

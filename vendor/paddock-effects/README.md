# Paddock effects

Canonical browser source for eleven palettes, ambient particles and RGB animation. No runtime dependencies. The initial renderer and palette came from Paddock; source hashes in the assets record that starting point. Future edits belong here.

For a plain browser, load `effects.css` and then `effects.js`:

```js
PaddockEffects.apply('classic', true);
const options = PaddockEffects.themes; // [{id,label}]
```

For an ESM bundler:

```js
import '@paddock/effects/styles.css';
import { apply, themes } from '@paddock/effects';
apply('hot-pink', true);
```

Call after `document.body` exists. `apply(id, effectsEnabled = true)` preserves a single background canvas through theme changes and returns the resolved theme id. Unknown ids use `classic`; old lowercase `stars`, `black`, `pink`, and `purple` ids migrate to `classic`, `normal`, `hot-pink`, and `violet`.

The package sets `data-theme`, `data-trim`, and `data-stars` on the body. Its backdrop sits at z-index -1 within the body's isolated stacking context; opaque application panels mask the effects. Integrators keep control of panel styling and preference persistence. Canvas drawing runs at up to 24 fps, pauses when hidden, and uses a still frame for reduced motion.

Run `npm test` with Playwright available to Node and a Chromium browser installed. Playwright is a development test tool, not a package runtime dependency. `PLAYWRIGHT_MODULE` can point to an existing installation. The test checks all eleven themes, repeated switching, backdrop layering, opaque panels, effects off, aliases, ESM exports and reduced motion.

For existing panel canvases, use the ESM exports `mountSky(host, slot)`, `refreshSky()` and `setSkyLevel(density, motion)`. This leaves application placement and body styling intact. Paddock uses this API; FamilyHub uses `apply()`.

Edit palette colors and theme metadata in `manifest.json`, then run `npm run build` to refresh the browser assets. Surface hues and RGB keyframes remain in `effects.css`; the particle renderer remains in `effects.js`.

The package is private and resides in FamilyHub. Paddock's `prebuild` and `prestart` sync it into `vendor/paddock-effects` and refresh its generated desktop/mobile palettes. That snapshot must be included when committing Paddock so standalone clones, Docker and CI work without a sibling checkout. `PADDOCK_EFFECTS_SOURCE` can select another package location; `node scripts/sync-shared-effects.cjs --check` checks drift. FamilyHub builds copy the browser assets into the app. No registry publication or separate repository has been created.

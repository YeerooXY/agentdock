# Theme authoring

## Palette and labels

Edit `themes/manifest.json` to add or change a theme. Each theme has a stable `id`, picker `label` and `detail`, opening effect, sky effect, accent pair (`a`, `b`), terminal `background`, `foreground`, `cursor` and `selection`. The same manifest also owns the lighting choices, star levels, ANSI palette and mobile appearance overrides.

`desktopOverrides.accent` records desktop trim colors that intentionally differ from a theme's shared accent pair. `desktopOverrides.frame` keeps independent console frame pairs explicit for icy and fiery; notably, fiery trim reverses its frame accent order. Other frame colors follow `a` and `b`. The animated `gamer` colors stay in CSS because they change over time. Do not copy palette literals into another stylesheet.

Generate and check the JS, CommonJS, Dart and desktop CSS outputs with:

```sh
node scripts/build-theme-data.cjs
node scripts/build-theme-data.cjs --check
```

The generated files are `src/generated/theme-data.js`, `electron/generated/theme-data.cjs`, `mobile/lib/generated/theme_data.dart` and `src/theme-palette.css`. Run `node --test tests/theme-data-generator.test.cjs` for schema, deterministic-output and effect-registry checks. `npm run build` also checks generated-file freshness.

## Stylesheet ownership

`src/styles.css` is the renderer stylesheet entry and defines the import order. `src/style.css` and `src/index.css` own the base rules and cascade-layer declarations; `src/tokens.css` owns shared spacing, width and radius tokens. Existing unlayered view styles remain above layered rules, so do not move them between layers as part of a theme edit.

`src/theme-palette.css` is generated desktop palette data and loads after `src/console-themes.css`, before `src/theme-system.css` so spectrum lighting keeps its cascade precedence. The theme system owns app-wide trim selection, lighting, focus, reduced-motion behavior and shared theme surfaces. `src/console-themes.css` owns console frame geometry, surfaces and patterns. `src/console-trim.css` owns dynamic console trim behavior. `src/page-layout.css` owns shared page widths and heading/section layout primitives; `src/workspace-glass.css` owns the glass visual treatment, not those shared primitives.

## Effects and phone appearance

`src/effects/registry.js` owns desktop opening and state-effect draw functions. The generator validates supported theme `opening` and `sky` IDs, and the theme-data test checks that each opening has a draw function. Keep each effect duration at or below 1600 ms, no more than two flashes, and honor `prefers-reduced-motion`. The theme-data test checks duration and flash limits.

For a new effect, implement the desktop draw function and phone painter, then
register its supported ID in `build-theme-data.cjs`. Generate the outputs; the
Dart opening and sky enums come from those same supported IDs. Run the phone
appearance tests as well as the generator checks.

The generated Dart data is consumed by `mobile/lib/console_theme.dart`. Phone appearance controls and painters live in `mobile/lib/console_appearance_controls.dart` and `mobile/lib/features/appearance/`. Keep phone presentation and appearance painters in those existing mobile feature files; use the manifest's `mobileOverrides` for shared palette exceptions rather than hard-coding theme-specific colors in a painter. Run the generator check and desktop theme-data test when changing shared values.

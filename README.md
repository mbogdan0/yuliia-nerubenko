# Yuliia Nerubenko Portfolio Demo

Interactive Spine animation gallery and slot demo by Yuliia Nerubenko, built with
PixiJS and Vite for GitHub Pages.

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To preview the production build:

```bash
npm run build
npm run preview
```

## Check changes

```bash
npm run typecheck
npm run lint
npm run build
```

## Project notes

`Spin & Win` creates one winning row and prevents accidental wins on other rows.
It follows the symbol order, skipping Joker until its popup is prepared. Other
spins and wins stay available while the popup loads or if its download fails.

Resizing scales the current grid and preserves the landed result and gold win
frame. Reel and row counts adapt when the next spin begins.

Both loading screens delay their small animated indicators and captions, respect
reduced motion, and finish without an extra wait. Failed views offer Retry;
startup failures offer Reload.

See the [symbol instructions](AGENTS.md#symbols) for asset setup and registration.

The [performance review](PERFORMANCE_REVIEW.md) records local measurements,
verification scope, and remaining asset export limits.

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

The Joker prize becomes available after its popup finishes background preparation.
Other spins and wins stay available while it loads or if the download fails.

See the [symbol instructions](AGENTS.md#symbols) for asset setup and registration.

The [performance review](PERFORMANCE_REVIEW.md) records local measurements,
verification scope, and remaining asset export limits.

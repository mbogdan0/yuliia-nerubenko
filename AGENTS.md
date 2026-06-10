# Agent Instructions

## TypeScript & Linting
After making any code changes, run `npm run typecheck && npm run lint` to verify there are no TypeScript errors or lint violations. Fix all errors and warnings before considering the task complete.

## Symbols
Each symbol lives in `data/symbols/<id>/` (`data/` is Vite's `publicDir`, served at `<base>/symbols/<id>/`) and ships in **two texture resolutions** that share one resolution-independent `skeleton.skel`: `high/` (full ~300px) and `low/` (`scale:0.7`, ~210px), each folder holding `atlas.atlas` + `atlas.png`. Because the `low` atlas declares `scale:0.7`, both map to the same skeleton space and render at the same logical size — `low` is purely lighter texture data (less VRAM, less shimmer when minified). The **Gallery** tab renders `high`, the **Slot demo** renders `low`, selected via the `SymbolResolution` (`"high" | "low"`) threaded through `ensureSpineAssets`/`createManualSpine`. There is intentionally no single-resolution fallback.

The symbol set is fully data-driven: a single `defineSymbol(id, label, emoji, fitSlots)` line in `src/symbols/definitions.ts` is the only code change a new symbol needs — the gallery selector, slot reels, spin results, and win detection all derive from the `symbolDefinitions` array automatically, and their on-screen order follows that array. Each symbol's Spine must expose animations named exactly `Idle` and `Win` (the only two the engine plays), and atlases should be exported with premultiplied alpha (`pma:true`). Assets load lazily on first use and are then cached, so the number of registered symbols carries no fixed startup cost.

To add or replace a symbol, lay out `data/symbols/<id>/{skeleton.skel, high/{atlas.atlas,atlas.png}, low/{atlas.atlas,atlas.png}}`. The animator delivers each resolution as a folder with arbitrarily-named atlas/png files, so rename every PNG to `atlas.png` and set each atlas's first line (its page reference) to `atlas.png`; then register the symbol in `definitions.ts`. `fitSlots` lists the Spine **slot** names of the symbol's solid body, used to compute its bounding box for auto-scaling — exclude purely decorative slots (glow, aura, sparkles, rays, impact, particles). These are slot names, **not** atlas region names (the two often differ), and any name that matches no slot is silently ignored, leaving a generic 300×300 fallback box — so confirm the names against the live skeleton instead of guessing.

## Release Workflow
When the user asks to "make a release" or "do a release", follow these steps in order:

1. **Commit uncommitted files** — if the working tree is dirty, stage and commit all modified files with a concise descriptive message.
2. **Squash local commits** — if there are commits ahead of `origin/main`, squash them into one: `git reset --soft origin/main && git commit -m "<summary>"`.
3. **Bump version** — run `npm version patch --no-git-tag-version` to update both `package.json` and `package-lock.json`, then commit: `git add package.json package-lock.json && git commit -m "Bump version to X.Y.Z"`.
4. **Tag** — `git tag vX.Y.Z`
5. **Push** — `git push origin main && git push origin vX.Y.Z`

All commit messages in English, concise and professional.

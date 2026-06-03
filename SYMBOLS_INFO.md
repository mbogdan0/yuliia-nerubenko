# Symbols Info

## Adding New Symbols

This section describes the exact steps to add a new symbol, for example "Bar", "Bell", or "Wild", to the slot demo. The system is designed so that a single registration in `src/symbols/definitions.ts` is the only code change required. Everything else, including loading, gallery, slot reels, and UI buttons, picks up the new symbol automatically.

### Step 1 - Add Spine assets

Create a folder under `data/symbols/` named after the symbol ID, lowercase with no spaces:

```text
data/symbols/<id>/
  skeleton.skel
  atlas.atlas
  textures/
    atlas.png
```

Examples of existing symbols:

```text
data/symbols/cherry/skeleton.skel
data/symbols/cherry/atlas.atlas
data/symbols/cherry/textures/atlas.png

data/symbols/seven/skeleton.skel
data/symbols/seven/atlas.atlas
data/symbols/seven/textures/atlas.png
```

The folder name must exactly match the `id` string used in `src/symbols/definitions.ts`. Paths are case-sensitive.

The Spine file must contain at least two animations named exactly `Idle` and `Win`. No other animation names are used by the engine.

### Step 2 - Register the symbol

Open `src/symbols/definitions.ts` and add one line to the `symbolDefinitions` array:

```ts
export const symbolDefinitions: SymbolDefinition[] = [
  defineSymbol("cherry", "Cherry", ["cherry1", "cherry2", "tail_c", "leaf_c", "glare1_c", "glare2_c"]),
  defineSymbol("seven", "Seven", ["7_body", "7_outline"]),
  defineSymbol("bar", "Bar", ["bar_body", "bar_shine"]),
];
```

`defineSymbol` signature:

```ts
defineSymbol(id: string, label: string, fitSlots: string[])
```

| Parameter | Description |
| --- | --- |
| `id` | Unique identifier. Must match the folder name in `data/symbols/`. Used to build asset paths. |
| `label` | Display name shown in the gallery UI button. |
| `fitSlots` | Array of Spine slot names used to compute the visual bounding box for auto-scaling. |

### Step 3 - Determine `fitSlots`

`fitSlots` controls how the symbol is scaled and centered in both the gallery and the slot cells.

Only the Spine slots listed here contribute to the bounding box calculation. Slots not listed, such as glows, shadows, and decorative particles, are ignored for sizing. This prevents decorative elements from inflating the bounds and making the core symbol appear too small.

How to find the correct slot names:

1. Open the Spine project for the symbol.
2. In the skeleton hierarchy, identify the slots that form the solid, visible body of the symbol.
3. Exclude slots that are purely decorative extras, such as ambient glow, background shadow, or sparkles.
4. List the slot names exactly as they appear in Spine.

Effects of wrong `fitSlots`:

- Too many slots, including glows: the symbol appears small and surrounded by empty space.
- Too few slots, missing the main body: the symbol appears oversized and can crop out of its cell.
- Misspelled slot names: those slots are silently ignored, with the same effect as too few slots.

Cherry example:

```ts
["cherry1", "cherry2", "tail_c", "leaf_c", "glare1_c", "glare2_c"]
```

This includes the two cherry shapes, stem, leaf, and two glare reflections. It excludes background glow, shadow, and particle effects.

### Automatic behavior

After registration, no other code changes are needed.

| System | Behavior |
| --- | --- |
| Asset loading | `ensureSpineAssets` loads the new symbol's `.skel` and `.atlas` when first needed. Subsequent calls use the cache. |
| Gallery | A new button appears in the symbol selector. Clicking it shows the symbol in focus mode. The all-symbols grid includes it. |
| Slot reels | Each reel cell pre-creates a Spine instance for the new symbol at startup. The symbol is eligible to appear on every spin. |
| Win detection | `checkHorizontalWins` works on any symbol ID. |
| Routing | Gallery URL hash supports `#/gallery/single/<id>`. |

### New symbol checklist

- [ ] `data/symbols/<id>/skeleton.skel` exists
- [ ] `data/symbols/<id>/atlas.atlas` exists
- [ ] `data/symbols/<id>/textures/atlas.png` exists
- [ ] Spine file contains animations named exactly `Idle` and `Win`
- [ ] `defineSymbol(id, label, fitSlots)` added to `symbolDefinitions` in `src/symbols/definitions.ts`
- [ ] `id` in `defineSymbol` matches the folder name exactly
- [ ] `fitSlots` contains the main body slots, not decorative extras
- [ ] `npm run build` passes with no errors

## Symbol Asset Notes

Generated during the render-performance refactor. This file tracks asset-side
findings (in `data/symbols/`) that may affect smooth slot and gallery rendering.
Code does not modify these assets — they are the animator's exports — so the
items below are recommendations for the next export pass.

## Current atlas inventory

| Symbol | Atlas (px) | PNG | Skeleton | `pma:` flag | PNG actually premultiplied? | Regions |
| --- | ---: | ---: | ---: | :---: | :---: | ---: |
| cherry | 292×316 | 91 KB | 4.4 KB | *(none)* | No (straight) | 7 |
| lemon | 432×268 | 100 KB | 2.8 KB | true | Yes | 5 |
| orange | 272×484 | 111 KB | 2.7 KB | true | Yes | 5 |
| plum | 260×472 | 114 KB | 4.1 KB | true | Yes | 5 |
| watermelon | 424×296 | 121 KB | 2.1 KB | true | Yes | 6 |
| seven | 1460×1556 | 543 KB | 15 KB | true | Yes | 31 |
| star | 1716×1444 | 790 KB | 6.9 KB | *(none)* | No (straight) | 28 |
| wild | 652×1628 | 850 KB | 7.9 KB | true | Yes | 26 |

The "actually premultiplied" column was verified by decoding each PNG and
checking the premultiplied-alpha invariant (no colour channel may exceed the
alpha channel) across every semi-transparent texel.

## Findings

### 1. Premultiplied-alpha is inconsistent across the set — but not currently broken

`cherry` and `star` are exported as **straight (non-premultiplied) alpha** and
their `.atlas` files correctly omit `pma:true`; the other six are exported
**premultiplied** and correctly declare `pma:true`. spine-pixi-v8 reads this
flag (`AtlasLoader`): `pma:true` → texture uploaded as `premultiplied-alpha`,
no flag → `premultiply-alpha-on-upload`. Because each symbol's flag matches its
actual PNG format, **all symbols render correctly today** — there is no
double-premultiply / dark-fringe bug.

Two consequences worth a fix on the next export, in priority order:

- **Do NOT simply add `pma:true` to cherry/star.** Their PNGs are straight-alpha,
  so adding the flag would tell the runtime they are premultiplied and produce
  dark halos. They must be **re-exported as premultiplied** if the flag is added.
- **Prefer premultiplied for all symbols.** Premultiplied textures avoid colour
  bleeding from fully-transparent texels into edges when bilinearly filtered and
  downscaled — exactly what happens to these symbols in the slot cells and the
  gallery grid. cherry and star (straight-alpha) are the ones most likely to show
  faint edge fringing when scaled down. Re-exporting them premultiplied also
  removes the one-time `premultiply-alpha-on-upload` work at load.

### 2. No mipmaps; large atlases are heavily downscaled

Every atlas uses `filter:Linear,Linear`. In spine-pixi-v8, a `Linear` min filter
maps to **no mipmaps** (`SpineTexture.toPixiMipMap`), so downscaled symbols are
sampled with plain bilinear. `seven` (1460×1556), `star` (1716×1444) and
`wild` (652×1628) are rendered far below native size in a slot cell (~186×205 px
at scale 1), so their core art is minified by a large factor — bilinear-only
minification shimmers slightly while reels scroll and scale.

Options, in order of preference:

- The planned **two-resolution atlas split** (a smaller slot atlas, a larger
  gallery atlas) is the cleanest fix and directly removes the over-large minify.
- Failing that, exporting with a trilinear filter (`filter:MipMapLinearLinear`)
  lets the runtime build mipmaps and removes most of the shimmer, at the cost of
  ~33% more texture memory per page.

### 3. Atlas dimensions are very uneven

Fruit atlases are small (≤ ~430 px), while `seven`, `star` and `wild` are
1.4k–1.7k px on their long edge and dominate texture-memory/upload cost. The
big three carry many glare/particle frame-sequence regions (26–31 regions vs
5–7 for fruit). These are the first candidates for a downscaled slot-resolution
atlas, since the glare frames do not need full resolution at slot size.

### 4. Skeleton sizes are fine

No skeleton is anomalously large. The biggest is `seven/skeleton.skel` (~15 KB);
the rest are 2–8 KB. No action needed.

import type { SymbolResolution } from "../types";

// The Slot demo renders the optimized low-resolution atlas (the Gallery uses high).
export const SLOT_RESOLUTION: SymbolResolution = "low";

// Reel columns are viewport-driven: desktop (landscape ≥900px) shows 4, everything
// else (mobile/portrait) shows 3. Rows never change. Resolve via resolveReelCount().
export const REEL_COUNT_COMPACT = 3;
export const REEL_COUNT_DESKTOP = 4;
export const ROW_COUNT = 3;
export const CELL_W = 190 * 0.96;          // cell width in px
export const CELL_H = 200 * 0.96;          // cell height in px

export function resolveReelCount(isCompact: boolean): number {
  return isCompact ? REEL_COUNT_COMPACT : REEL_COUNT_DESKTOP;
}

export const SLOT_GRID_H = ROW_COUNT * CELL_H;
export const SLOT_GRID_VISUAL_PADDING = 8;
export const SLOT_STAGE_MAX_HEIGHT = SLOT_GRID_H + SLOT_GRID_VISUAL_PADDING * 2;

// Grid width and stage width depend on the active reel count, so they are helpers
// rather than constants — the stage re-sizes when the reel count switches.
export function slotGridWidth(reelCount: number): number {
  return reelCount * CELL_W;
}
export function slotStageMaxWidth(reelCount: number): number {
  return slotGridWidth(reelCount) + SLOT_GRID_VISUAL_PADDING * 2;
}
// Fit-to-viewport-height floor: the stage never shrinks narrower than this to
// stay readable; below it the page scrolls instead (e.g. landscape phones).
export const SLOT_STAGE_MIN_WIDTH = 280;

// --- Motion model (position-based; all units are CELLS unless noted) ---
// The reel tracks a continuous scroll `position`. Row r shows strip index position+r.
export const SPIN_CELLS_PER_SEC = 15;   // free-spin speed (cells/s)
export const SPIN_ACCEL_TIME = 0.2;   // s — quick ease-in to full speed at spin start
export const STOP_MIN_CELLS = 2;       // min cells travelled during the stop deceleration
export const STOP_DURATION_MIN = 0.15;  // s — clamp for the stop tween
export const STOP_DURATION_MAX = 0.85;  // s
// Landing overshoot: the reel springs ~this fraction of a cell past the target
// before settling, giving a tactile "thunk" on each stop.
//   ~1.7 ≈ classic easeOutBack (~10% overshoot); 0 = no bounce (plain easeOut).
// Keep modest (≈1.5–2.0): larger values overshoot more than one cell.
export const STOP_OVERSHOOT = 1.73;

// Direction symbols travel during a spin. Real reels fall (content moves down),
// which the strip math does as `scroll` decreases. -1 = down (real), +1 = up.
export const SPIN_STEP = -1;

// --- Spin start: a brief back-kick (wind-up) before launch, like a real reel ---
export const SPIN_WINDUP_CELLS = 0.2; // cells recoiled opposite to travel (0 disables)
export const SPIN_WINDUP_TIME = 0.09;  // s spent on the recoil

// --- Per-reel / per-stop randomness so reels don't move in lockstep ---
// Disabled for now: every spin is identical and deterministic. Bump any of these
// above 0 to re-introduce variance — the motion code already reads them.
export const SPIN_SPEED_JITTER = 0;     // ± fraction on free-spin speed (per reel, per spin)
export const STOP_EXTRA_CELLS_MAX = 0;  // 0..N extra whole cells added to each stop's travel
export const STOP_OVERSHOOT_JITTER = 0; // ± fraction on landing overshoot (per stop)
export const REEL_STOP_DELAY_JITTER = 0; // ± ms on the gap between sequential reel stops

export const SPIN_MIN_DURATION = 700; // ms of free spin before reels begin stopping
export const REEL_STOP_DELAY = 150;    // ms between sequential reel stops

export const SLOT_MAX_RENDER_RESOLUTION = 2;
export const SLOT_COMPACT_RENDER_RESOLUTION = 1.5;

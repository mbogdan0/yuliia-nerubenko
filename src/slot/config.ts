import type { SymbolResolution } from "../types";

// The Slot demo renders the optimized low-resolution atlas (the Gallery uses high).
export const SLOT_RESOLUTION: SymbolResolution = "low";

// Desktop (landscape ≥900px) shows 4 reels × 3 rows. Compact viewports use
// 3 reels, with a fourth row only when a tall portrait screen has room for it.
export const REEL_COUNT_COMPACT = 3;
export const REEL_COUNT_DESKTOP = 4;
export const ROW_COUNT_COMPACT = 4;
export const ROW_COUNT_DESKTOP = 3;
export const CELL_W = 190 * 0.96;          // cell width in px
export const CELL_H = 200 * 0.96;          // cell height in px

export function resolveReelCount(isCompact: boolean): number {
  return isCompact ? REEL_COUNT_COMPACT : REEL_COUNT_DESKTOP;
}

export function resolveRowCount(isCompact: boolean, viewportWidth: number, viewportHeight: number): number {
  const hasRoomForFourthRow = isCompact && viewportHeight > viewportWidth && viewportHeight >= 700;
  if (!hasRoomForFourthRow) return ROW_COUNT_DESKTOP;

  const stageW = slotStageMaxWidth(REEL_COUNT_COMPACT);
  const availableW = Math.min(stageW, Math.max(1, viewportWidth - 24));
  // Approximate the portrait navigation, controls, credit, and outer spacing.
  const availableH = Math.max(1, viewportHeight - 214);
  const fittedStageArea = (rowCount: number): number => {
    const stageH = slotStageMaxHeight(rowCount);
    const scale = Math.min(1, availableW / stageW, availableH / stageH);
    return stageW * stageH * scale * scale;
  };

  // Add a row only when it gives the artwork noticeably more screen area.
  return fittedStageArea(ROW_COUNT_COMPACT) >= fittedStageArea(ROW_COUNT_DESKTOP) * 1.1
    ? ROW_COUNT_COMPACT
    : ROW_COUNT_DESKTOP;
}

export const SLOT_GRID_VISUAL_PADDING = 8;

// Grid and stage dimensions follow the active reel and row counts.
export function slotGridWidth(reelCount: number): number {
  return reelCount * CELL_W;
}
export function slotGridHeight(rowCount: number): number {
  return rowCount * CELL_H;
}
export function slotStageMaxWidth(reelCount: number): number {
  return slotGridWidth(reelCount) + SLOT_GRID_VISUAL_PADDING * 2;
}
export function slotStageMaxHeight(rowCount: number): number {
  return slotGridHeight(rowCount) + SLOT_GRID_VISUAL_PADDING * 2;
}
// Fit-to-viewport-height floor: the stage never shrinks narrower than this to
// stay readable; below it the page scrolls instead (e.g. landscape phones).
export const SLOT_STAGE_MIN_WIDTH = 280;

// --- Motion model (position-based; all units are CELLS unless noted) ---
// The reel tracks a continuous scroll `position`. Row r shows strip index position+r.
export const SPIN_CELLS_PER_SEC = 15;   // free-spin speed (cells/s)
export const SPIN_ACCEL_TIME = 0.2;   // s — quick ease-in to full speed at spin start
export const STOP_MIN_CELLS = 3;       // min cells travelled during the stop deceleration
export const STOP_DURATION_MIN = 0.15;  // s — clamp for the stop tween
// Keep the baseline max above the velocity-matched duration ((overshoot+3)·cells/speed,
// ≈1.12s for three rows; Reel extends it for a larger visible window so the clamp never bites — a
// clamped duration makes the reel visibly speed up when the stop tween begins.
export const STOP_DURATION_MAX = 1.2;   // s
// Landing overshoot: the reel springs ~this fraction of a cell past the target
// before settling, giving a tactile "thunk" on each stop.
//   ~1.7 ≈ classic easeOutBack (~10% overshoot); 0 = no bounce (plain easeOut).
// 1.2 ≈ gentle ~6% overshoot; keep modest (<2.0): larger values overshoot more than one cell.
export const STOP_OVERSHOOT = 1.2;

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
export const REEL_STOP_DELAY_JITTER = 0; // ± ms on the gap between sequential reel stop starts

export const SPIN_MIN_DURATION = 700; // ms of free spin before reels begin stopping
// Gap between sequential reel stop STARTS — decelerations overlap, so this sets
// the cascade rhythm while the previous reel is still settling.
export const REEL_STOP_DELAY = 300;    // ms

export const SLOT_MAX_RENDER_RESOLUTION = 2;
export const SLOT_COMPACT_RENDER_RESOLUTION = 1.5;

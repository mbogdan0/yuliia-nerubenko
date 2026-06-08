import type { SymbolResolution } from "../types";

// The Slot demo renders the optimized low-resolution atlas (the Gallery uses high).
export const SLOT_RESOLUTION: SymbolResolution = "low";

export const REEL_COUNT = 3;
export const ROW_COUNT = 3;
export const CELL_W = 200 * 0.93;          // cell width in px
export const CELL_H = 220 * 0.93;          // cell height in px

// --- Motion model (position-based; all units are CELLS unless noted) ---
// The reel tracks a continuous scroll `position`. Row r shows strip index position+r.
export const SPIN_CELLS_PER_SEC = 16;   // free-spin speed (cells/s) ≈ 2000 px/s
export const SPIN_ACCEL_TIME = 0.2;   // s — quick ease-in to full speed at spin start
export const STOP_MIN_CELLS = 2;       // min cells travelled during the stop deceleration
export const STOP_DURATION_MIN = 0.15;  // s — clamp for the stop tween
export const STOP_DURATION_MAX = 0.85;  // s
// Landing overshoot: the reel springs ~this fraction of a cell past the target
// before settling, giving a tactile "thunk" on each stop.
//   ~1.7 ≈ classic easeOutBack (~10% overshoot); 0 = no bounce (plain easeOut).
// Keep modest (≈1.5–2.0): larger values overshoot more than one cell.
export const STOP_OVERSHOOT = 1.7;

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

export const SPIN_MIN_DURATION = 650; // ms of free spin before reels begin stopping
export const REEL_STOP_DELAY = 150;    // ms between sequential reel stops

export const SLOT_DESKTOP_SIDE_PADDING = 24;
export const SLOT_COMPACT_SIDE_PADDING = 18;
export const SLOT_COMPACT_TOP_RESERVE = 16;
export const SLOT_COMPACT_BOTTOM_RESERVE = 34;

export const SLOT_MAX_RENDER_RESOLUTION = 2;
export const SLOT_COMPACT_RENDER_RESOLUTION = 1.5;

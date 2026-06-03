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

export const SPIN_MIN_DURATION = 650; // ms of free spin before reels begin stopping
export const REEL_STOP_DELAY = 150;    // ms between sequential reel stops

export const SLOT_DESKTOP_SIDE_PADDING = 24;
export const SLOT_COMPACT_SIDE_PADDING = 10;
// Breathing room (CSS px) between the reels and the measured surrounding UI.
export const SLOT_COMPACT_RESERVE_GAP = 12;

export const SLOT_MAX_RENDER_RESOLUTION = 2;
export const SLOT_COMPACT_RENDER_RESOLUTION = 1.5;

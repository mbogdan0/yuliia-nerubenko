import type { Application } from "pixi.js";
import { getCachedSymbolBounds } from "../symbols/bounds";
import type { GalleryMode, StageArea, SymbolPreview } from "../types";
import { isGalleryCompactViewport } from "./responsive";

const MIN_STAGE_WIDTH = 280;
const MIN_STAGE_HEIGHT = 220;

const DESKTOP_GRID_COLUMNS = 3;
const COMPACT_GRID_COLUMNS = 2;

const COMPACT_FOCUS_STAGE_MIN_HEIGHT = 300;
const COMPACT_FOCUS_STAGE_MAX_HEIGHT = 430;

// Fraction of the available area a single focused preview may occupy per axis.
const FOCUS_FILL_W = 0.82;
const PREVIEW_FILL_H = 0.78;
const COMPACT_FOCUS_SIZE_FACTOR = 0.8;

// --- Symbol sizing & spacing ---
// Symbols are sized by WIDTH (so they stay a consistent, generous size regardless
// of how many there are) and capped at MAX. The canvas then grows tall enough to
// hold every row, so large symbol sets simply scroll the page. Logical CSS px
// (DPR-independent — autoDensity handles density, do NOT scale by devicePixelRatio).
//
// Each constant is a [compact, desktop] tuple resolved at layout time via
// resolveGallerySizing(). Index 0 = compact/mobile (viewport < 900 px or portrait),
// index 1 = desktop (viewport ≥ 900 px and landscape).
type ResponsivePair = [compact: number, desktop: number];

const GALLERY_SYMBOL_MAX_DISPLAY_SIZE: Record<GalleryMode, ResponsivePair> = {
  all: [175, 170], // mobile, desktop
  focus: [240, 250],
};
// Below this, drop a column so symbols don't get cramped on narrow widths.
const GALLERY_SYMBOL_MIN_DISPLAY_SIZE: ResponsivePair = [120, 160];
// The only spacing knob: the minimum gap between (and around) symbols. Everything
// else is automatic — leftover room is distributed space-evenly per axis, so the
// horizontal and vertical gaps are computed independently and need not match.
const GALLERY_SYMBOL_MIN_GAP: ResponsivePair = [35, 55];

type GallerySizing = { maxDisplaySize: number; minDisplaySize: number; minGap: number };

function resolveGallerySizing(currentMode: GalleryMode, isCompact: boolean): GallerySizing {
  const i = isCompact ? 0 : 1;
  return {
    maxDisplaySize: GALLERY_SYMBOL_MAX_DISPLAY_SIZE[currentMode][i],
    minDisplaySize: GALLERY_SYMBOL_MIN_DISPLAY_SIZE[i],
    minGap: GALLERY_SYMBOL_MIN_GAP[i],
  };
}

type GalleryGridMetrics = {
  columns: number;
  rows: number;
  symbolSize: number;
  gapX: number;
  gapY: number;
};

export function getGalleryStageHeight(
  itemCount: number,
  currentMode: GalleryMode,
  areaWidth: number,
  viewportWidth: number,
  viewportHeight: number
): number | null {
  const isCompact = isGalleryCompactViewport(viewportWidth, viewportHeight);

  if (currentMode === "focus") {
    // Compact focus drives an explicit canvas height; desktop focus lets the CSS
    // grid fill the viewport (see the desktop #game-root rule).
    return isCompact
      ? Math.round(clamp(viewportWidth * 0.9, COMPACT_FOCUS_STAGE_MIN_HEIGHT, COMPACT_FOCUS_STAGE_MAX_HEIGHT))
      : null;
  }

  // Natural grid height at the minimum gap. Compact uses it as the canvas height
  // (the page scrolls); desktop uses it as a min-height floor, so the stage fills
  // the viewport for small sets and grows past it — scrolling — for large ones.
  const sizing = resolveGallerySizing(currentMode, isCompact);
  const availableWidth = Math.max(MIN_STAGE_WIDTH, areaWidth);
  const preferredColumns = isCompact ? COMPACT_GRID_COLUMNS : DESKTOP_GRID_COLUMNS;
  const grid = computeGrid(itemCount, availableWidth, 0, preferredColumns, sizing);
  return Math.round(grid.rows * grid.symbolSize + (grid.rows + 1) * sizing.minGap);
}

export function layoutPreviews(
  previews: SymbolPreview[],
  app: Application,
  gameRootEl: HTMLElement,
  currentMode: GalleryMode
): void {
  if (previews.length === 0) {
    return;
  }

  const area = getStageArea(app.screen.width, gameRootEl);
  // Mode is viewport-driven so it matches the CSS layout. Inside the desktop
  // sidebar grid the canvas (app.screen) is far narrower than the window, so it
  // must not be what decides compact-vs-desktop.
  const isCompact = isGalleryCompactViewport(window.innerWidth, window.innerHeight);
  const sizing = resolveGallerySizing(currentMode, isCompact);

  if (currentMode === "focus") {
    const centerX = area.x + area.width / 2;
    const centerY = area.y + area.height * 0.5;
    const compactFocusFactor = isCompact ? COMPACT_FOCUS_SIZE_FACTOR : 1;
    positionPreview(
      previews[0],
      centerX,
      centerY,
      area.width * FOCUS_FILL_W * compactFocusFactor,
      area.height * PREVIEW_FILL_H * compactFocusFactor,
      sizing.maxDisplaySize
    );
    return;
  }

  const grid = computeGrid(
    previews.length,
    area.width,
    area.height,
    isCompact ? COMPACT_GRID_COLUMNS : DESKTOP_GRID_COLUMNS,
    sizing
  );

  previews.forEach((preview, index) => {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const centerX = area.x + grid.gapX + grid.symbolSize / 2 + column * (grid.symbolSize + grid.gapX);
    const centerY = area.y + grid.gapY + grid.symbolSize / 2 + row * (grid.symbolSize + grid.gapY);
    positionPreview(preview, centerX, centerY, grid.symbolSize, grid.symbolSize, sizing.maxDisplaySize);
  });
}

export function getStageArea(width: number, gameRootEl: HTMLElement): StageArea {
  // The grid spans the whole canvas; the space-evenly edge gaps are its margins.
  // `width` is the canvas render width (app.screen); rootBounds.height is the live
  // canvas box (mobile: JS-driven --gallery-stage-height; desktop: the stage row).
  const rootBounds = gameRootEl.getBoundingClientRect();
  return {
    x: 0,
    y: 0,
    width: Math.max(MIN_STAGE_WIDTH, width),
    height: Math.max(MIN_STAGE_HEIGHT, rootBounds.height)
  };
}

export function positionPreview(
  preview: SymbolPreview,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number,
  maxDisplaySize: number
): void {
  const bounds = getCachedSymbolBounds(preview.definition, preview.spine);
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const fitScale = Math.min(maxWidth / width, maxHeight / height);
  const sizeCapScale = maxDisplaySize / Math.max(width, height);
  const scale = Math.min(fitScale, sizeCapScale);

  preview.host.x = 0;
  preview.host.y = 0;
  preview.spine.scale.set(scale);
  preview.spine.x = centerX - (bounds.x + bounds.width / 2) * scale;
  preview.spine.y = centerY - (bounds.y + bounds.height / 2) * scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Largest column count (down from preferred) whose symbols still clear the minimum
// display size by width. Fewer columns mean larger symbols, so narrow widths trade
// columns for size rather than shrinking everything.
function resolveColumns(
  itemCount: number,
  availableWidth: number,
  preferredColumns: number,
  minDisplaySize: number,
  minGap: number
): number {
  const maxColumns = Math.min(preferredColumns, Math.max(1, itemCount));
  for (let columns = maxColumns; columns > 1; columns -= 1) {
    if (maxSymbolForColumns(availableWidth, columns, minGap) >= minDisplaySize) {
      return columns;
    }
  }
  return 1;
}

// Largest symbol edge that fits `columns` cells across `availableWidth` keeping at
// least minGap on both sides of every cell (space-evenly: columns + 1 gap slots).
function maxSymbolForColumns(availableWidth: number, columns: number, minGap: number): number {
  return (availableWidth - minGap * (columns + 1)) / columns;
}

function computeGrid(
  itemCount: number,
  availableWidth: number,
  availableHeight: number,
  preferredColumns: number,
  sizing: GallerySizing
): GalleryGridMetrics {
  const { maxDisplaySize, minDisplaySize, minGap } = sizing;
  const safeItemCount = Math.max(1, itemCount);
  const columns = resolveColumns(safeItemCount, availableWidth, preferredColumns, minDisplaySize, minGap);
  const rows = Math.ceil(safeItemCount / columns);

  // Width-driven size, capped. Height never shrinks symbols — the canvas grows
  // instead — so large sets keep a readable size and just scroll.
  const symbolSize = Math.max(1, Math.min(maxSymbolForColumns(availableWidth, columns, minGap), maxDisplaySize));

  // Distribute leftover space-evenly on each axis independently (edge gaps included),
  // never below the minimum. Vertical gaps grow only when the canvas is taller than
  // the grid needs (small sets on tall screens), which simply centers the rows.
  const gapX = Math.max(minGap, (availableWidth - columns * symbolSize) / (columns + 1));
  const gapY = Math.max(minGap, (availableHeight - rows * symbolSize) / (rows + 1));

  return { columns, rows, symbolSize, gapX, gapY };
}

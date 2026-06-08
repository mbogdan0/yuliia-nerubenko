import type { Application } from "pixi.js";
import { isCompactViewport } from "../responsive";
import { getCachedSymbolBounds } from "../symbols/bounds";
import type { GalleryMode, StageArea, SymbolPreview } from "../types";

// Layout thresholds and sizing constants.
const GRID_COLUMNS_4_MIN_WIDTH = 960;
const GRID_COLUMNS_3_MIN_WIDTH = 620;
const SIDE_DOCK_HEIGHT_RATIO = 0.62;
const COMPACT_PADDING_BREAKPOINT = 560;
const COMPACT_PADDING = 18;
const NORMAL_PADDING = 34;
const MIN_STAGE_WIDTH = 280;
const MIN_STAGE_HEIGHT_SIDE_DOCKED = 240;
const MIN_STAGE_HEIGHT_BOTTOM_DOCKED = 220;
const COMPACT_GRID_COLUMNS = 2;
const COMPACT_STAGE_VERTICAL_PADDING = 52;
const COMPACT_FOCUS_STAGE_MIN_HEIGHT = 300;
const COMPACT_FOCUS_STAGE_MAX_HEIGHT = 430;
const COMPACT_GRID_ROW_MIN_HEIGHT = 180;
const COMPACT_GRID_ROW_MAX_HEIGHT = 236;

// Fraction of the available area a preview may occupy in each axis.
const FOCUS_FILL_W = 0.82;
const PREVIEW_FILL_H = 0.78;
const GRID_FILL_W = 0.84;
// Maximum spine scale applied in grid ("all") mode to prevent large symbols
// from dominating the cell.
const GRID_SCALE_CAP = 0.78;
const COMPACT_FOCUS_SIZE_FACTOR = 0.8;
// Largest on-screen side (in app.screen / logical CSS px) a symbol preview may
// reach. Symbol art isn't authored for huge sizes. Logical px keeps the physical
// size consistent across DPR — autoDensity handles density, so do NOT scale this
// by devicePixelRatio.
const MAX_SYMBOL_DISPLAY_SIZE = 265;

export function getCompactGalleryStageHeight(
  previewCount: number,
  currentMode: GalleryMode,
  viewportWidth: number,
  viewportHeight: number
): number | null {
  if (!isCompactViewport(viewportWidth, viewportHeight)) {
    return null;
  }

  if (currentMode === "focus") {
    return Math.round(clamp(viewportWidth * 0.9, COMPACT_FOCUS_STAGE_MIN_HEIGHT, COMPACT_FOCUS_STAGE_MAX_HEIGHT));
  }

  const rows = Math.max(1, Math.ceil(previewCount / COMPACT_GRID_COLUMNS));
  const rowHeight = clamp(viewportWidth * 0.58, COMPACT_GRID_ROW_MIN_HEIGHT, COMPACT_GRID_ROW_MAX_HEIGHT);
  return Math.round(rows * rowHeight + COMPACT_STAGE_VERTICAL_PADDING);
}

export function layoutPreviews(
  previews: SymbolPreview[],
  app: Application,
  gameRootEl: HTMLElement,
  panelEl: HTMLElement,
  currentMode: GalleryMode
): void {
  if (previews.length === 0) {
    return;
  }

  const area = getStageArea(app.screen.width, app.screen.height, gameRootEl, panelEl);

  if (currentMode === "focus") {
    const centerX = area.x + area.width / 2;
    const centerY = area.y + area.height * 0.5;
    const compactFocusFactor = isCompactViewport(app.screen.width, app.screen.height)
      ? COMPACT_FOCUS_SIZE_FACTOR
      : 1;
    positionPreview(
      previews[0],
      centerX,
      centerY,
      area.width * FOCUS_FILL_W * compactFocusFactor,
      area.height * PREVIEW_FILL_H * compactFocusFactor,
      currentMode
    );
    return;
  }

  const columns = isCompactViewport(app.screen.width, app.screen.height)
    ? COMPACT_GRID_COLUMNS
    : area.width >= GRID_COLUMNS_4_MIN_WIDTH ? 4 : area.width >= GRID_COLUMNS_3_MIN_WIDTH ? 3 : 2;
  const rows = Math.ceil(previews.length / columns);
  const cellWidth = area.width / columns;
  const cellHeight = area.height / rows;

  previews.forEach((preview, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = area.x + column * cellWidth + cellWidth / 2;
    const centerY = area.y + row * cellHeight + cellHeight * 0.5;
    positionPreview(preview, centerX, centerY, cellWidth * GRID_FILL_W, cellHeight * PREVIEW_FILL_H, currentMode);
  });
}

export function getStageArea(width: number, height: number, gameRootEl: HTMLElement, panelEl: HTMLElement): StageArea {
  const panelBounds = panelEl.getBoundingClientRect();
  const rootBounds = gameRootEl.getBoundingClientRect();
  const padding = width < COMPACT_PADDING_BREAKPOINT ? COMPACT_PADDING : NORMAL_PADDING;

  if (isCompactViewport(width, height)) {
    return {
      x: padding,
      y: padding,
      width: Math.max(MIN_STAGE_WIDTH, width - padding * 2),
      height: Math.max(MIN_STAGE_HEIGHT_BOTTOM_DOCKED, height - padding * 2)
    };
  }

  const panelIsSideDocked =
    panelBounds.height > height * SIDE_DOCK_HEIGHT_RATIO || panelBounds.left > width * 0.5;

  if (panelIsSideDocked) {
    const reservedRight = Math.max(0, rootBounds.right - panelBounds.left) + padding;
    return {
      x: padding,
      y: padding,
      width: Math.max(MIN_STAGE_WIDTH, width - reservedRight - padding),
      height: Math.max(MIN_STAGE_HEIGHT_SIDE_DOCKED, height - padding * 2)
    };
  }

  const topReserve = padding;
  const reservedBottom = Math.max(0, rootBounds.bottom - panelBounds.top) + padding;
  return {
    x: padding,
    y: topReserve,
    width: Math.max(MIN_STAGE_WIDTH, width - padding * 2),
    height: Math.max(MIN_STAGE_HEIGHT_BOTTOM_DOCKED, height - reservedBottom - topReserve)
  };
}

export function positionPreview(
  preview: SymbolPreview,
  centerX: number,
  centerY: number,
  maxWidth: number,
  maxHeight: number,
  currentMode: GalleryMode
): void {
  const bounds = getCachedSymbolBounds(preview.definition, preview.spine);
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);
  const fitScale = Math.min(maxWidth / width, maxHeight / height);
  const sizeCapScale = MAX_SYMBOL_DISPLAY_SIZE / Math.max(width, height);
  const modeCap = currentMode === "focus" ? 1 : GRID_SCALE_CAP;
  const scale = Math.min(fitScale, modeCap, sizeCapScale);

  preview.host.x = 0;
  preview.host.y = 0;
  preview.spine.scale.set(scale);
  preview.spine.x = centerX - (bounds.x + bounds.width / 2) * scale;
  preview.spine.y = centerY - (bounds.y + bounds.height / 2) * scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

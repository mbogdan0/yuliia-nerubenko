import { CELL_H, CELL_W, REEL_COUNT, ROW_COUNT } from "./config";

export type SlotGridLayout = {
  x: number;
  y: number;
  scale: number;
};

// Internal stage gutters (CSS px) so the reels fit inside the canvas without
// visually colliding with surrounding DOM controls.
export type SlotGridReserves = {
  topReserve: number;
  bottomReserve: number;
  sidePadding: number;
};

export function calculateSlotGridLayout(
  screenW: number,
  screenH: number,
  reserves: SlotGridReserves
): SlotGridLayout {
  const gridW = REEL_COUNT * CELL_W;
  const gridH = ROW_COUNT * CELL_H;
  const availableW = Math.max(1, screenW - reserves.sidePadding * 2);
  const availableH = Math.max(1, screenH - reserves.topReserve - reserves.bottomReserve);
  const scale = Math.min(1, availableW / gridW, availableH / gridH);
  const scaledW = gridW * scale;
  const scaledH = gridH * scale;

  return {
    x: (screenW - scaledW) / 2,
    y: reserves.topReserve + Math.max(0, (availableH - scaledH) / 2),
    scale
  };
}

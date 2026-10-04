import { SLOT_GRID_VISUAL_PADDING } from "./config";

export type SlotGridLayout = {
  x: number;
  y: number;
  scale: number;
};

export function calculateSlotGridLayout(screenW: number, screenH: number, gridW: number, gridH: number): SlotGridLayout {
  const availableW = Math.max(1, screenW - SLOT_GRID_VISUAL_PADDING * 2);
  const availableH = Math.max(1, screenH - SLOT_GRID_VISUAL_PADDING * 2);
  const scale = Math.min(1, availableW / gridW, availableH / gridH);
  const scaledW = gridW * scale;
  const scaledH = gridH * scale;

  return {
    x: (screenW - scaledW) / 2,
    y: (screenH - scaledH) / 2,
    scale
  };
}

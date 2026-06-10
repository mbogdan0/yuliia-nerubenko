import { SLOT_GRID_H, SLOT_GRID_VISUAL_PADDING, SLOT_GRID_W } from "./config";

export type SlotGridLayout = {
  x: number;
  y: number;
  scale: number;
};

export function calculateSlotGridLayout(screenW: number, screenH: number): SlotGridLayout {
  const availableW = Math.max(1, screenW - SLOT_GRID_VISUAL_PADDING * 2);
  const availableH = Math.max(1, screenH - SLOT_GRID_VISUAL_PADDING * 2);
  const scale = Math.min(1, availableW / SLOT_GRID_W, availableH / SLOT_GRID_H);
  const scaledW = SLOT_GRID_W * scale;
  const scaledH = SLOT_GRID_H * scale;

  return {
    x: (screenW - scaledW) / 2,
    y: (screenH - scaledH) / 2,
    scale
  };
}

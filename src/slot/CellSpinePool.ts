import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { stableSlotIdleAnimation } from "../symbols/animations";
import { getCachedSymbolBounds } from "../symbols/bounds";
import { symbolsById, getDefaultSymbol } from "../symbols/definitions";
import { createManualSpine } from "../symbols/spine";
import type { SymbolId } from "../types";
import {
  CELL_H,
  CELL_W,
  REEL_COUNT_COMPACT,
  REEL_COUNT_DESKTOP,
  ROW_COUNT_COMPACT,
  ROW_COUNT_DESKTOP,
  SLOT_RESOLUTION
} from "./config";

// Fraction of the cell dimensions the spine may fill.
const DEFAULT_CELL_FILL_FACTOR = 0.82;
const MAX_POOLED_SPINES_PER_SYMBOL = Math.max(
  REEL_COUNT_DESKTOP * (ROW_COUNT_DESKTOP + 2),
  REEL_COUNT_COMPACT * (ROW_COUNT_COMPACT + 2)
);

const pool = new Map<SymbolId, Spine[]>();

export function acquireCellSpine(id: SymbolId): Spine {
  let spines = pool.get(id);
  if (!spines) {
    spines = [];
    pool.set(id, spines);
  }

  const spine = spines.pop();
  if (spine) {
    if (spine.parent) {
      spine.parent.removeChild(spine);
    }
    resetCellSpine(spine);
    return spine;
  }

  // Create new spine if pool is empty
  const definition = symbolsById.get(id) ?? getDefaultSymbol();
  const newSpine = createManualSpine(definition, SLOT_RESOLUTION);

  newSpine.state.setAnimation(0, stableSlotIdleAnimation(definition), false);
  newSpine.update(0);

  const bounds = getCachedSymbolBounds(definition, newSpine);
  const cellFillFactor = definition.slotFillFactor ?? DEFAULT_CELL_FILL_FACTOR;
  const fitScale = Math.min(
    (CELL_W * cellFillFactor) / Math.max(bounds.width, 1),
    (CELL_H * cellFillFactor) / Math.max(bounds.height, 1)
  );
  newSpine.scale.set(fitScale);
  newSpine.x = CELL_W / 2 - (bounds.x + bounds.width / 2) * fitScale;
  newSpine.y = CELL_H / 2 - (bounds.y + bounds.height / 2) * fitScale;

  return newSpine;
}

export function releaseCellSpine(id: SymbolId, spine: Spine): void {
  if (spine.parent) {
    spine.parent.removeChild(spine);
  }
  resetCellSpine(spine);

  let spines = pool.get(id);
  if (!spines) {
    spines = [];
    pool.set(id, spines);
  }
  if (spines.length >= MAX_POOLED_SPINES_PER_SYMBOL) {
    spine.destroy({ children: true });
    return;
  }
  spines.push(spine);
}

function resetCellSpine(spine: Spine): void {
  spine.state.clearTracks();
  spine.skeleton.setupPose();
}

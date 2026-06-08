import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { getCachedSymbolBounds } from "../symbols/bounds";
import { symbolsById, getDefaultSymbol } from "../symbols/definitions";
import { createManualSpine } from "../symbols/spine";
import type { SymbolId } from "../types";
import { CELL_H, CELL_W, SLOT_RESOLUTION } from "./config";

// Fraction of the cell dimensions the spine may fill.
const CELL_FILL_FACTOR = 0.82;

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

  newSpine.state.setAnimation(0, "Idle", false);
  newSpine.update(0);

  const bounds = getCachedSymbolBounds(definition, newSpine);
  const fitScale = Math.min(
    (CELL_W * CELL_FILL_FACTOR) / Math.max(bounds.width, 1),
    (CELL_H * CELL_FILL_FACTOR) / Math.max(bounds.height, 1)
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
  spines.push(spine);
}

function resetCellSpine(spine: Spine): void {
  spine.state.clearTracks();
  spine.skeleton.setupPose();
}

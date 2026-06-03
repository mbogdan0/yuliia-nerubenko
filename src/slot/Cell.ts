import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container } from "pixi.js";
import { getCachedSymbolBounds } from "../symbols/bounds";
import { createManualSpine } from "../symbols/spine";
import type { SymbolDefinition, SymbolId } from "../types";
import { CELL_H, CELL_W } from "./config";

// Fraction of the cell dimensions the spine may fill.
const CELL_FILL_FACTOR = 0.82;

export class Cell extends Container {
  private spines = new Map<SymbolId, Spine>();
  private activeId: SymbolId | null = null;
  private activeAnimation: "Idle" | "Win" | null = null;

  constructor(definitions: SymbolDefinition[]) {
    super();

    for (const def of definitions) {
      const spine = createCellSpine(def);
      this.addChild(spine);
      this.spines.set(def.id, spine);
    }
  }

  setSymbol(id: SymbolId, options: { resetIdleAnimation?: boolean } = {}): void {
    if (this.activeId === id) return;

    if (this.activeId !== null) {
      const prev = this.spines.get(this.activeId);
      if (prev) prev.visible = false;
    }

    this.activeId = id;
    const spine = this.spines.get(id);
    if (!spine) return;
    spine.visible = true;
    this.activeAnimation = null;

    if (options.resetIdleAnimation ?? true) {
      this.playIdle();
      spine.update(0);
    } else {
      this.applyIdlePose(spine);
    }
  }

  get currentSymbolId(): SymbolId | null {
    return this.activeId;
  }

  playIdle(): void {
    this.withActiveSpine((spine) => {
      if (this.activeAnimation === "Idle") return;
      spine.state.setAnimation(0, "Idle", true);
      this.activeAnimation = "Idle";
    });
  }

  playWin(): void {
    this.withActiveSpine((spine) => {
      spine.state.setAnimation(0, "Win", false);
      this.activeAnimation = "Win";
    });
  }

  update(dt: number): void {
    // Hot path: runs for every pool cell every frame. Inlined (rather than via
    // withActiveSpine) to avoid allocating a closure per cell per frame.
    if (this.activeId === null) return;
    const spine = this.spines.get(this.activeId);
    if (spine) spine.update(dt);
  }

  private withActiveSpine(callback: (spine: Spine) => void): void {
    if (this.activeId === null) return;
    const spine = this.spines.get(this.activeId);
    if (spine) callback(spine);
  }

  private applyIdlePose(spine: Spine): void {
    spine.state.setAnimation(0, "Idle", true);
    spine.update(0);
    this.activeAnimation = "Idle";
  }
}

function createCellSpine(definition: SymbolDefinition): Spine {
  const spine = createManualSpine(definition);

  spine.state.setAnimation(0, "Idle", false);
  spine.update(0);

  const bounds = getCachedSymbolBounds(definition, spine);
  const fitScale = Math.min(
    (CELL_W * CELL_FILL_FACTOR) / Math.max(bounds.width, 1),
    (CELL_H * CELL_FILL_FACTOR) / Math.max(bounds.height, 1)
  );
  spine.scale.set(fitScale);
  spine.x = CELL_W / 2 - (bounds.x + bounds.width / 2) * fitScale;
  spine.y = CELL_H / 2 - (bounds.y + bounds.height / 2) * fitScale;

  spine.visible = false;
  return spine;
}

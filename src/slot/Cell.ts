import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container } from "pixi.js";
import type { SymbolId } from "../types";
import { acquireCellSpine, releaseCellSpine } from "./CellSpinePool";

export class Cell extends Container {
  private activeId: SymbolId | null = null;
  private activeSpine: Spine | null = null;
  private activeAnimation: "Idle" | "Win" | null = null;

  constructor() {
    super();
  }

  setSymbol(id: SymbolId, options: { resetIdleAnimation?: boolean } = {}): void {
    if (this.activeId === id) return;

    if (this.activeId !== null && this.activeSpine) {
      this.removeChild(this.activeSpine);
      releaseCellSpine(this.activeId, this.activeSpine);
    }

    this.activeId = id;
    this.activeSpine = acquireCellSpine(id);
    this.addChild(this.activeSpine);
    this.activeAnimation = null;

    if (options.resetIdleAnimation ?? true) {
      this.playIdle();
      this.activeSpine.update(0);
    } else {
      this.applyIdlePose(this.activeSpine);
    }
  }

  get currentSymbolId(): SymbolId | null {
    return this.activeId;
  }

  playIdle(): void {
    if (!this.activeSpine) return;
    if (this.activeAnimation === "Idle") return;
    this.activeSpine.state.setAnimation(0, "Idle", true);
    this.activeAnimation = "Idle";
  }

  playWin(): void {
    if (!this.activeSpine) return;
    this.activeSpine.state.setAnimation(0, "Win", false);
    // Win is a one-shot that would otherwise freeze on its last frame; queue the
    // looping Idle to follow when the symbol defines one, so the cell keeps idling.
    if (this.activeSpine.skeleton.data.findAnimation("Idle")) {
      this.activeSpine.state.addAnimation(0, "Idle", true, 0);
    }
    this.activeAnimation = "Win";
  }

  /**
   * Impact accent played the instant a reel locks this cell into place.
   * No dedicated "Land" spine clip exists yet, so this currently just returns the
   * symbol to its looping Idle — swap in a non-looping "Land" animation (then chain
   * back to Idle) here when the animator provides one.
   */
  playLand(): void {
    // TODO(land): play the "Land" impact clip when available.
    this.playIdle();
  }

  update(dt: number): void {
    // Hot path: runs for every pool cell every frame.
    if (this.activeSpine) this.activeSpine.update(dt);
  }

  private applyIdlePose(spine: Spine): void {
    spine.state.setAnimation(0, "Idle", true);
    spine.update(0);
    this.activeAnimation = "Idle";
  }
}

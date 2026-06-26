import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container } from "pixi.js";
import { randomAnimationVariant, stableSlotIdleAnimation } from "../symbols/animations";
import { getDefaultSymbol, symbolsById } from "../symbols/definitions";
import {
  JOKER_FAIL,
  JOKER_IDLE_INTRO,
  JOKER_SYMBOL_ID,
  JOKER_WIN_NORMAL,
  JokerIdleSequencer,
  type JokerIdleStep
} from "../symbols/jokerState";
import type { SymbolDefinition, SymbolId } from "../types";
import { acquireCellSpine, releaseCellSpine } from "./CellSpinePool";

export class Cell extends Container {
  private activeId: SymbolId | null = null;
  private activeSpine: Spine | null = null;
  private activeAnimation: "Idle" | "Win" | null = null;
  private readonly jokerIdle = new JokerIdleSequencer();

  constructor() {
    super();
  }

  setSymbol(id: SymbolId, options: { resetIdleAnimation?: boolean } = {}): void {
    if (this.activeId === id) {
      if (options.resetIdleAnimation ?? true) {
        this.resetAnimationState();
        this.playIdle();
        this.activeSpine?.update(0);
      }
      return;
    }

    if (this.activeId !== null && this.activeSpine) {
      this.removeChild(this.activeSpine);
      releaseCellSpine(this.activeId, this.activeSpine);
    }

    this.activeId = id;
    this.activeSpine = acquireCellSpine(id);
    this.addChild(this.activeSpine);
    this.resetAnimationState();

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

    if (this.isJoker()) {
      this.startJokerIdle(true);
      return;
    }

    const idleAnimation = stableSlotIdleAnimation(this.getActiveDefinition());
    this.activeSpine.state.setAnimation(0, idleAnimation, true);
    this.activeAnimation = "Idle";
  }

  playWin(animationName?: string): void {
    if (!this.activeSpine) return;
    const definition = this.getActiveDefinition();

    if (this.isJoker()) {
      this.playJokerEvent(animationName ?? JOKER_WIN_NORMAL);
      return;
    }

    const winAnimation = animationName ?? randomAnimationVariant(definition, "Win");
    const idleAnimation = stableSlotIdleAnimation(definition);

    this.activeSpine.state.setAnimation(0, winAnimation, false);
    // Win is a one-shot that would otherwise freeze on its last frame; queue the
    // looping Idle to follow when the symbol defines one, so the cell keeps idling.
    if (this.activeSpine.skeleton.data.findAnimation(idleAnimation)) {
      this.activeSpine.state.addAnimation(0, idleAnimation, true, 0);
    }
    this.activeAnimation = "Win";
  }

  playFail(): void {
    if (!this.activeSpine || !this.isJoker()) return;
    this.playJokerEvent(JOKER_FAIL);
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
    if (!this.activeSpine) return;

    this.activeSpine.update(dt);
    if (this.isJoker()) this.updateJokerState(dt);
  }

  private applyIdlePose(spine: Spine): void {
    if (this.isJoker()) {
      // Static reference pose: skip the intro and settle straight on the main idle.
      this.applyJokerStep(this.jokerIdle.start(false));
      spine.update(0);
      return;
    }

    const idleAnimation = stableSlotIdleAnimation(this.getActiveDefinition());
    spine.state.setAnimation(0, idleAnimation, true);
    spine.update(0);
    this.activeAnimation = "Idle";
  }

  private startJokerIdle(playIntro: boolean): void {
    if (!this.activeSpine) return;

    const hasIntro = playIntro && this.getAnimationDuration(JOKER_IDLE_INTRO) > 0;
    this.applyJokerStep(this.jokerIdle.start(hasIntro));
    this.activeSpine.update(0);
  }

  private playJokerEvent(animationName: string): void {
    if (!this.activeSpine) return;
    this.applyJokerStep(this.jokerIdle.startEvent(animationName));
  }

  private updateJokerState(dt: number): void {
    const current = this.jokerIdle.animation;
    if (!this.activeSpine || current === null) return;

    const step = this.jokerIdle.advance(dt, this.getAnimationDuration(current));
    if (step) this.applyJokerStep(step);
  }

  private applyJokerStep(step: JokerIdleStep): void {
    if (!this.activeSpine) return;

    this.activeSpine.state.setAnimation(0, step.animation, false);
    this.activeAnimation = step.state === "event" ? "Win" : "Idle";
  }

  /** Duration (seconds) of a clip on the active spine, or 0 if the clip is absent. */
  animationDurationSeconds(animationName: string): number {
    return this.getAnimationDuration(animationName);
  }

  private getAnimationDuration(animationName: string): number {
    return this.activeSpine?.skeleton.data.findAnimation(animationName)?.duration ?? 0;
  }

  private getActiveDefinition(): SymbolDefinition {
    return this.activeId ? symbolsById.get(this.activeId) ?? getDefaultSymbol() : getDefaultSymbol();
  }

  private isJoker(): boolean {
    return this.activeId === JOKER_SYMBOL_ID;
  }

  private resetAnimationState(): void {
    this.activeAnimation = null;
    this.jokerIdle.reset();
  }
}

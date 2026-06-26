import { Container, Ticker, type Application } from "pixi.js";
import { syncRendererToElement } from "../rendererSizing";
import { SLOT_MAX_RENDER_RESOLUTION } from "../slot/config";
import type { AnimationName, GalleryMode, SymbolId, SymbolPreview, SymbolResolution } from "../types";
import { nextAnimationVariant } from "../symbols/animations";
import { ensureSpineAssets } from "../symbols/assets";
import { getDefaultSymbol, symbolDefinitions, symbolsById } from "../symbols/definitions";
import {
  JOKER_IDLE_INTRO,
  JOKER_SYMBOL_ID,
  JokerIdleSequencer,
  type JokerIdleStep
} from "../symbols/jokerState";
import { getGalleryStageHeight, layoutPreviews } from "./layout";
import { bindControls, renderSymbolButtons, updateControls, type GalleryDomElements } from "./controls";
import {
  animationMixDurationSeconds,
  getPreviewAnimationDuration,
  hasPreviewAnimation,
  playPreviewAnimation
} from "./playback";
import { createSymbolPreview } from "./preview";

export type GalleryRouteState = {
  mode: GalleryMode;
  selectedSymbolId: SymbolId;
};

// Alpha fade speeds (units: fraction of gap closed per second, exponential decay).
const WIN_FADE_SPEED = 7.5;
const IDLE_FADE_SPEED = 5.5;
const LOOP_RESTART_DELAY_SECONDS = 0.9;

// The Gallery renders the full-resolution atlas (the Slot demo uses low).
const GALLERY_RESOLUTION: SymbolResolution = "high";

export class GalleryTab {
  private currentMode: GalleryMode = "all";
  private currentAnimation: AnimationName = "Win";
  private selectedSymbolId: SymbolId = getDefaultSymbol().id;
  private activePreviews: SymbolPreview[] = [];
  private loopElapsedSeconds = new Map<SymbolPreview, number>();
  private animationDurationSeconds = new Map<SymbolPreview, number>();
  private activeAnimationNames = new Map<SymbolPreview, string>();
  private jokerSequencers = new Map<SymbolPreview, JokerIdleSequencer>();
  private loopCycleDurationSeconds = LOOP_RESTART_DELAY_SECONDS;
  private rebuildGeneration = 0;
  private resizeFrame: number | null = null;

  constructor(
    private readonly app: Application,
    private readonly previewLayer: Container,
    private readonly elements: GalleryDomElements,
    private readonly onStateChange?: (state: GalleryRouteState) => void
  ) {}

  async init(): Promise<void> {
    renderSymbolButtons(this.elements, symbolDefinitions);

    bindControls(this.elements, {
      onModeChange: async (mode) => {
        if (mode === this.currentMode) return;
        this.currentMode = mode;
        await this.rebuildGallery();
        this.notifyStateChange();
      },
      onAnimationChange: (anim) => {
        if (anim === this.currentAnimation) return;
        this.currentAnimation = anim;
        this.transitionAnimation();
        this.syncControls();
      },
      onSymbolChange: async (id) => {
        if (id === this.selectedSymbolId && this.currentMode === "focus") return;
        this.selectedSymbolId = id;
        this.currentMode = "focus";
        await this.rebuildGallery();
        this.notifyStateChange();
      }
    });

    this.syncControls();
    await this.rebuildGallery();
  }

  getRouteState(): GalleryRouteState {
    return {
      mode: this.currentMode,
      selectedSymbolId: this.selectedSymbolId
    };
  }

  async applyRouteState(state: GalleryRouteState): Promise<void> {
    const selectedSymbol = symbolsById.get(state.selectedSymbolId) ?? getDefaultSymbol();
    const nextMode = state.mode;

    if (nextMode === this.currentMode && selectedSymbol.id === this.selectedSymbolId) {
      this.syncControls();
      this.layout();
      return;
    }

    this.currentMode = nextMode;
    this.selectedSymbolId = selectedSymbol.id;
    await this.rebuildGallery();
  }

  tick(ticker: Ticker): void {
    const deltaSeconds = ticker.deltaMS / 1000;

    for (const preview of this.activePreviews) {
      this.updatePreviewPlayback(preview, deltaSeconds);
      this.fadePreview(preview, deltaSeconds);
    }

    // No layout() here: relayout is event-driven (onResize + rebuild/route
    // changes), so the render loop avoids a per-frame reflow.
  }

  onResize(): void {
    if (this.resizeFrame !== null) {
      return;
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.layout();
    });
  }

  private async rebuildGallery(): Promise<void> {
    // "Latest wins" guard: rapid mode/symbol switching interleaves these async
    // rebuilds (each awaits asset loading). Without it, a slower earlier rebuild
    // could resume after a newer one and leak orphaned previews into the layer.
    const generation = ++this.rebuildGeneration;

    this.destroyPreviews();

    const symbols = this.getSymbolsForCurrentMode();

    const loaded = await ensureSpineAssets(symbols, GALLERY_RESOLUTION);
    if (generation !== this.rebuildGeneration) return;

    this.activePreviews = loaded.map((symbol) => createSymbolPreview(symbol, GALLERY_RESOLUTION));
    this.animationDurationSeconds.clear();
    this.activePreviews.forEach((preview) => {
      this.applyAnimation(preview, 0);
      preview.spine.update(0);
    });
    this.updateLoopCycleDuration();

    for (const preview of this.activePreviews) {
      this.previewLayer.addChild(preview.host);
    }

    this.syncControls();
    this.layout();
  }

  private transitionAnimation(): void {
    this.animationDurationSeconds.clear();
    this.activePreviews.forEach((preview) => {
      this.applyAnimation(preview, this.currentAnimation === "Idle" ? 0 : animationMixDurationSeconds);
    });
    this.updateLoopCycleDuration();
  }

  private applyAnimation(preview: SymbolPreview, mixDuration: number, trackTime = 0): number {
    if (this.currentAnimation === "Idle" && this.isJokerPreview(preview)) {
      return this.startJokerIdlePreview(preview, mixDuration);
    }

    this.jokerSequencers.delete(preview);
    const animation = nextAnimationVariant(preview.definition, this.currentAnimation);
    const duration = getPreviewAnimationDuration(preview, animation);
    const previousAnimation = this.activeAnimationNames.get(preview);

    playPreviewAnimation(preview, {
      animation,
      trackTime: Math.min(trackTime, duration),
      mixDuration,
      loop: this.currentAnimation === "Idle",
      previousAnimation
    });

    this.activeAnimationNames.set(preview, animation);
    this.animationDurationSeconds.set(preview, duration);
    this.loopElapsedSeconds.set(preview, trackTime);
    return duration;
  }

  private getAnimationDuration(preview: SymbolPreview): number {
    const animation = this.activeAnimationNames.get(preview);
    return this.animationDurationSeconds.get(preview)
      ?? getPreviewAnimationDuration(preview, animation ?? this.currentAnimation);
  }

  private updatePreviewPlayback(preview: SymbolPreview, deltaSeconds: number): void {
    if (this.currentAnimation === "Idle") {
      if (this.isJokerPreview(preview)) {
        this.updateJokerIdlePreview(preview, deltaSeconds);
        return;
      }

      const animation = this.activeAnimationNames.get(preview);
      if (animation && hasPreviewAnimation(preview, animation)) {
        preview.spine.update(deltaSeconds);
      }
      return;
    }

    const duration = this.getAnimationDuration(preview);
    const previousElapsed = this.loopElapsedSeconds.get(preview) ?? 0;
    const elapsed = previousElapsed + deltaSeconds;

    if (elapsed >= this.loopCycleDurationSeconds) {
      const nextElapsed = elapsed % this.loopCycleDurationSeconds;
      this.restartLoopPreview(preview, nextElapsed);
      return;
    }

    this.loopElapsedSeconds.set(preview, elapsed);

    if (previousElapsed < duration) {
      preview.spine.update(Math.min(deltaSeconds, duration - previousElapsed));
    }
  }

  private updateLoopCycleDuration(): void {
    let longestAnimationDuration = 0;
    for (const duration of this.animationDurationSeconds.values()) {
      longestAnimationDuration = Math.max(longestAnimationDuration, duration);
    }

    this.loopCycleDurationSeconds = longestAnimationDuration + LOOP_RESTART_DELAY_SECONDS;
  }

  private restartLoopPreview(preview: SymbolPreview, elapsedSeconds: number): void {
    this.applyAnimation(preview, 0, elapsedSeconds);
    this.updateLoopCycleDuration();
    preview.spine.update(0);
  }

  private startJokerIdlePreview(preview: SymbolPreview, mixDuration: number): number {
    const hasIntro =
      hasPreviewAnimation(preview, JOKER_IDLE_INTRO) &&
      getPreviewAnimationDuration(preview, JOKER_IDLE_INTRO) > 0;

    const sequencer = new JokerIdleSequencer();
    this.jokerSequencers.set(preview, sequencer);
    return this.playJokerPreviewStep(preview, sequencer.start(hasIntro), mixDuration);
  }

  private updateJokerIdlePreview(preview: SymbolPreview, deltaSeconds: number): void {
    const sequencer = this.jokerSequencers.get(preview);
    const animation = this.activeAnimationNames.get(preview);
    if (!sequencer || !animation || !hasPreviewAnimation(preview, animation)) return;

    preview.spine.update(deltaSeconds);

    const step = sequencer.advance(deltaSeconds, this.getAnimationDuration(preview));
    if (step) this.playJokerPreviewStep(preview, step, 0);
  }

  private playJokerPreviewStep(preview: SymbolPreview, step: JokerIdleStep, mixDuration: number): number {
    const duration = getPreviewAnimationDuration(preview, step.animation);
    const previousAnimation = this.activeAnimationNames.get(preview);

    playPreviewAnimation(preview, {
      animation: step.animation,
      trackTime: 0,
      mixDuration,
      loop: false,
      previousAnimation
    });

    this.activeAnimationNames.set(preview, step.animation);
    this.animationDurationSeconds.set(preview, duration);
    this.loopElapsedSeconds.set(preview, 0);
    return duration;
  }

  private getSymbolsForCurrentMode() {
    return this.currentMode === "all"
      ? symbolDefinitions
      : [symbolsById.get(this.selectedSymbolId) ?? getDefaultSymbol()];
  }

  private fadePreview(preview: SymbolPreview, deltaSeconds: number): void {
    const speed = this.currentAnimation === "Win" ? WIN_FADE_SPEED : IDLE_FADE_SPEED;
    preview.host.alpha += (preview.targetAlpha - preview.host.alpha) * Math.min(deltaSeconds * speed, 1);
  }

  private layout(): void {
    // 1) Size the canvas to the stage box to learn its current width. 2) Compute
    // the stage height from that exact width. 3) Re-sync so the canvas adopts the
    // new height. 4) Lay out. Deriving the height and the grid from the same
    // app.screen.width keeps them consistent — the canvas is always exactly tall
    // enough for every row, so nothing is clipped after a resize.
    this.syncRendererToGameRoot();
    this.updateStageHeight();
    this.syncRendererToGameRoot();
    layoutPreviews(
      this.activePreviews,
      this.app,
      this.elements.gameRoot,
      this.currentMode
    );
  }

  private updateStageHeight(): void {
    const height = getGalleryStageHeight(
      this.activePreviews.length,
      this.currentMode,
      this.app.screen.width,
      window.innerWidth,
      window.innerHeight
    );
    if (height === null) {
      if (this.elements.gameRoot.style.getPropertyValue("--gallery-stage-height")) {
        this.elements.gameRoot.style.removeProperty("--gallery-stage-height");
      }
      return;
    }

    const nextHeight = `${height}px`;
    if (this.elements.gameRoot.style.getPropertyValue("--gallery-stage-height") !== nextHeight) {
      this.elements.gameRoot.style.setProperty("--gallery-stage-height", nextHeight);
    }
  }

  private syncRendererToGameRoot(): void {
    syncRendererToElement(this.app, this.elements.gameRoot, this.getTargetRenderResolution());
  }

  private getTargetRenderResolution(): number {
    return Math.min(window.devicePixelRatio || 1, SLOT_MAX_RENDER_RESOLUTION);
  }

  private syncControls(): void {
    updateControls(this.elements, {
      mode: this.currentMode,
      animation: this.currentAnimation,
      selectedSymbolId: this.selectedSymbolId
    });
  }

  private notifyStateChange(): void {
    this.onStateChange?.(this.getRouteState());
  }

  private destroyPreviews(): void {
    for (const preview of this.activePreviews) {
      preview.spine.destroy({ children: true });
      preview.host.destroy({ children: true });
    }
    this.activePreviews = [];
    this.loopElapsedSeconds.clear();
    this.animationDurationSeconds.clear();
    this.activeAnimationNames.clear();
    this.jokerSequencers.clear();
    this.loopCycleDurationSeconds = LOOP_RESTART_DELAY_SECONDS;
    this.previewLayer.removeChildren();
  }

  private isJokerPreview(preview: SymbolPreview): boolean {
    return preview.id === JOKER_SYMBOL_ID;
  }
}

import { Container, Ticker, type Application } from "pixi.js";
import { syncRendererToElement } from "../rendererSizing";
import { setStageLoading, showStageLoadingError } from "../loadingScreen";
import { reportError } from "../reportError";
import { SLOT_MAX_RENDER_RESOLUTION } from "../slot/config";
import type { AnimationName, GalleryMode, SymbolDefinition, SymbolId, SymbolPreview, SymbolResolution } from "../types";
import { nextAnimationVariant } from "../symbols/animations";
import { ensureSpineAssets } from "../symbols/assets";
import { getCachedSymbolBounds } from "../symbols/bounds";
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
  private visibilityFrame: number | null = null;
  private controlsBound = false;
  private renderedState: GalleryRouteState | null = null;

  constructor(
    private readonly app: Application,
    private readonly previewLayer: Container,
    private readonly elements: GalleryDomElements,
    private readonly onStateChange?: (state: GalleryRouteState) => void
  ) {}

  async init(state: GalleryRouteState = this.getRouteState()): Promise<void> {
    this.currentMode = state.mode;
    this.selectedSymbolId = symbolsById.has(state.selectedSymbolId) ? state.selectedSymbolId : getDefaultSymbol().id;
    if (!this.controlsBound) {
      this.bindControls();
      this.controlsBound = true;
    }

    this.syncControls();
    await this.rebuildGallery();
  }

  private bindControls(): void {
    renderSymbolButtons(this.elements, symbolDefinitions);

    bindControls(this.elements, {
      onModeChange: async (mode) => {
        if (mode === this.currentMode && this.hasRenderedCurrentState()) return;
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
        if (id === this.selectedSymbolId && this.currentMode === "focus" && this.hasRenderedCurrentState()) return;
        this.selectedSymbolId = id;
        this.currentMode = "focus";
        await this.rebuildGallery();
        this.notifyStateChange();
      }
    });

    window.addEventListener("scroll", this.scheduleVisibilityUpdate, { passive: true });
    window.visualViewport?.addEventListener("scroll", this.scheduleVisibilityUpdate, { passive: true });
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

    if (nextMode === this.currentMode && selectedSymbol.id === this.selectedSymbolId && this.hasRenderedCurrentState()) {
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
    const elapsed = (this.loopElapsedSeconds.get(this.activePreviews[0]) ?? 0) + deltaSeconds;
    const restartCycle = this.currentAnimation === "Win" && elapsed >= this.loopCycleDurationSeconds;

    if (restartCycle) {
      const nextElapsed = elapsed % this.loopCycleDurationSeconds;
      // Pick every variant against the same cycle boundary. Recomputing the
      // cycle halfway through a row can leave later previews one loop behind.
      for (const preview of this.activePreviews) {
        this.applyAnimation(preview, 0, nextElapsed);
        if (preview.host.renderable) preview.spine.update(0);
      }
      this.updateLoopCycleDuration();
    }

    for (const preview of this.activePreviews) {
      if (!restartCycle) this.updatePreviewPlayback(preview, deltaSeconds);
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
    this.syncControls();
    if (this.previewLayer.parent?.visible) setStageLoading(this.elements.gameRoot, true);

    const symbols = this.getSymbolsForCurrentMode();

    let loaded: SymbolDefinition[];
    try {
      loaded = await ensureSpineAssets(symbols, GALLERY_RESOLUTION);
      if (loaded.length === 0) throw new Error("No gallery symbols could be loaded.");
    } catch (error) {
      if (generation === this.rebuildGeneration && this.previewLayer.parent?.visible) {
        showStageLoadingError(this.elements.gameRoot, () => {
          this.rebuildGallery().then(() => this.notifyStateChange()).catch(reportError);
        });
      }
      throw error;
    }
    if (generation !== this.rebuildGeneration) return;

    this.destroyPreviews();
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

    this.renderedState = this.getRouteState();
    this.syncControls();
    this.layout();
    if (this.previewLayer.parent?.visible) setStageLoading(this.elements.gameRoot, false);
  }

  private transitionAnimation(): void {
    this.animationDurationSeconds.clear();
    this.activePreviews.forEach((preview) => {
      this.applyAnimation(preview, this.currentAnimation === "Idle" ? 0 : animationMixDurationSeconds);
      // Static Idle clips need their pose applied before frame updates can stop.
      preview.spine.update(0);
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
      mixDuration: preview.host.renderable ? mixDuration : 0,
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
      if (!preview.host.renderable) return;
      if (this.isJokerPreview(preview)) {
        this.updateJokerIdlePreview(preview, deltaSeconds);
        return;
      }

      const animation = this.activeAnimationNames.get(preview);
      const track = preview.spine.state.getTrack(0);
      if (animation && hasPreviewAnimation(preview, animation)
        && (this.getAnimationDuration(preview) > 0 || track?.mixingFrom || track?.next
          || preview.spine.skeleton.physics.length > 0)) {
        preview.spine.update(deltaSeconds);
      }
      return;
    }

    const duration = this.getAnimationDuration(preview);
    const previousElapsed = this.loopElapsedSeconds.get(preview) ?? 0;
    const elapsed = previousElapsed + deltaSeconds;

    this.loopElapsedSeconds.set(preview, elapsed);

    if (preview.host.renderable && previousElapsed < duration) {
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
    // Asset loads can finish after navigation; the active tab owns the renderer.
    if (!this.previewLayer.parent?.visible) return;
    // Derive height from the same rounded width used by the renderer. Apply both
    // dimensions in one resize, avoiding a temporary backing store allocation.
    this.updateStageHeight(Math.round(this.elements.gameRoot.getBoundingClientRect().width));
    this.syncRendererToGameRoot();
    layoutPreviews(
      this.activePreviews,
      this.app,
      this.elements.gameRoot,
      this.currentMode
    );
    this.updateVisiblePreviews();
  }

  private readonly scheduleVisibilityUpdate = (): void => {
    if (this.visibilityFrame !== null) return;
    this.visibilityFrame = window.requestAnimationFrame(() => {
      this.visibilityFrame = null;
      this.updateVisiblePreviews();
    });
  };

  private updateVisiblePreviews(): void {
    if (this.activePreviews.length === 0) return;
    const stage = this.elements.gameRoot.getBoundingClientRect();
    const viewportTop = window.visualViewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);

    for (const preview of this.activePreviews) {
      const bounds = getCachedSymbolBounds(preview.definition, preview.spine);
      // Keep space for glow and particles beyond the fitted body. Visibility
      // changes are measured on scroll/resize, never inside the animation loop.
      const top = stage.top + preview.spine.y + bounds.y * preview.spine.scale.y - 100;
      const bottom = top + bounds.height * preview.spine.scale.y + 200;
      const visible = bottom >= viewportTop && top <= viewportBottom;

      if (visible && !preview.host.renderable && this.currentAnimation === "Win") {
        const track = preview.spine.state.getTrack(0);
        if (track) {
          track.trackTime = Math.min(this.loopElapsedSeconds.get(preview) ?? 0, this.getAnimationDuration(preview));
          track.mixTime = track.mixDuration;
          track.setAnimationLast(track.trackTime);
          preview.spine.update(0);
        }
      }
      preview.host.renderable = visible;
    }
  }

  private updateStageHeight(width: number): void {
    const height = getGalleryStageHeight(
      this.activePreviews.length,
      this.currentMode,
      width,
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

  private hasRenderedCurrentState(): boolean {
    return this.renderedState?.mode === this.currentMode
      && this.renderedState.selectedSymbolId === this.selectedSymbolId;
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

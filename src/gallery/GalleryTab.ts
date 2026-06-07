import { Container, Ticker, type Application } from "pixi.js";
import type { AnimationName, GalleryMode, SymbolId, SymbolPreview } from "../types";
import { ensureSpineAssets } from "../symbols/assets";
import { getDefaultSymbol, symbolDefinitions, symbolsById } from "../symbols/definitions";
import { getCompactGalleryStageHeight, layoutPreviews } from "./layout";
import { bindControls, renderSymbolButtons, updateControls, type GalleryDomElements } from "./controls";
import { animationMixDurationSeconds, getPreviewAnimationDuration, playPreviewAnimation } from "./playback";
import { createSymbolPreview } from "./preview";

export type GalleryRouteState = {
  mode: GalleryMode;
  selectedSymbolId: SymbolId;
};

// Alpha fade speeds (units: fraction of gap closed per second, exponential decay).
const WIN_FADE_SPEED = 7.5;
const IDLE_FADE_SPEED = 5.5;
const LOOP_RESTART_DELAY_SECONDS = 1.2;

export class GalleryTab {
  private currentMode: GalleryMode = "all";
  private currentAnimation: AnimationName = "Win";
  private selectedSymbolId: SymbolId = getDefaultSymbol().id;
  private activePreviews: SymbolPreview[] = [];
  private loopElapsedSeconds = new Map<SymbolPreview, number>();
  private animationDurationSeconds = new Map<SymbolPreview, number>();
  private loopCycleDurationSeconds = LOOP_RESTART_DELAY_SECONDS;
  private lastAppliedAnimation: AnimationName = "Win";
  private panelResizeObserver: ResizeObserver | null = null;
  private rebuildGeneration = 0;

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
        this.lastAppliedAnimation = this.currentAnimation;
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

    this.observePanelResize();

    this.syncControls();
    await this.rebuildGallery();
  }

  // Relayout when the settings panel's box changes. Event-driven so the render
  // loop avoids a per-frame reflow with getBoundingClientRect.
  private observePanelResize(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.panelResizeObserver = new ResizeObserver(() => this.layout());
    this.panelResizeObserver.observe(this.elements.settingsPanel);
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

    // No layout() here: relayout is event-driven (onResize + observePanelResize +
    // rebuild/route changes), so the render loop avoids a per-frame reflow.
  }

  onResize(): void {
    this.layout();
  }

  private async rebuildGallery(): Promise<void> {
    // "Latest wins" guard: rapid mode/symbol switching interleaves these async
    // rebuilds (each awaits asset loading). Without it, a slower earlier rebuild
    // could resume after a newer one and leak orphaned previews into the layer.
    const generation = ++this.rebuildGeneration;

    this.destroyPreviews();

    const symbols = this.getSymbolsForCurrentMode();

    await ensureSpineAssets(symbols);
    if (generation !== this.rebuildGeneration) return;

    this.activePreviews = symbols.map((symbol) => createSymbolPreview(symbol));
    this.cachePlaybackDurations();
    this.activePreviews.forEach((preview) => {
      this.applyAnimation(preview, 0);
      preview.spine.update(0);
    });

    for (const preview of this.activePreviews) {
      this.previewLayer.addChild(preview.host);
    }

    this.syncControls();
    this.layout();
  }

  private transitionAnimation(): void {
    this.cachePlaybackDurations();
    this.activePreviews.forEach((preview) => {
      this.applyAnimation(preview, animationMixDurationSeconds);
    });
  }

  private applyAnimation(preview: SymbolPreview, mixDuration: number): void {
    playPreviewAnimation(preview, {
      animation: this.currentAnimation,
      trackTime: 0,
      mixDuration,
      previousAnimation: this.lastAppliedAnimation
    });

    this.loopElapsedSeconds.set(preview, 0);
  }

  private getAnimationDuration(preview: SymbolPreview, animationName: AnimationName): number {
    return this.animationDurationSeconds.get(preview) ?? getPreviewAnimationDuration(preview, animationName);
  }

  private updatePreviewPlayback(preview: SymbolPreview, deltaSeconds: number): void {
    const duration = this.getAnimationDuration(preview, this.currentAnimation);
    const previousElapsed = this.loopElapsedSeconds.get(preview) ?? 0;
    const elapsed = previousElapsed + deltaSeconds;

    if (elapsed >= this.loopCycleDurationSeconds) {
      const nextElapsed = elapsed % this.loopCycleDurationSeconds;
      this.restartLoopPreview(preview, nextElapsed, duration);
      return;
    }

    this.loopElapsedSeconds.set(preview, elapsed);

    if (previousElapsed < duration) {
      preview.spine.update(Math.min(deltaSeconds, duration - previousElapsed));
    }
  }

  private cachePlaybackDurations(): void {
    this.animationDurationSeconds.clear();

    let longestAnimationDuration = 0;
    for (const preview of this.activePreviews) {
      const duration = getPreviewAnimationDuration(preview, this.currentAnimation);
      this.animationDurationSeconds.set(preview, duration);
      longestAnimationDuration = Math.max(longestAnimationDuration, duration);
    }

    this.loopCycleDurationSeconds = longestAnimationDuration + LOOP_RESTART_DELAY_SECONDS;
  }

  private restartLoopPreview(preview: SymbolPreview, elapsedSeconds: number, duration: number): void {
    playPreviewAnimation(preview, {
      animation: this.currentAnimation,
      trackTime: Math.min(elapsedSeconds, duration),
      mixDuration: 0
    });

    this.loopElapsedSeconds.set(preview, elapsedSeconds);
    preview.spine.update(0);
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
    this.updateCompactStageHeight();
    this.syncRendererToGameRoot();
    layoutPreviews(
      this.activePreviews,
      this.app,
      this.elements.gameRoot,
      this.elements.settingsPanel,
      this.currentMode
    );
  }

  private updateCompactStageHeight(): void {
    const height = getCompactGalleryStageHeight(
      this.activePreviews.length,
      this.currentMode,
      window.innerWidth,
      window.innerHeight
    );
    if (height === null) {
      this.elements.gameRoot.style.removeProperty("--gallery-stage-height");
      return;
    }

    this.elements.gameRoot.style.setProperty("--gallery-stage-height", `${height}px`);
  }

  private syncRendererToGameRoot(): void {
    const bounds = this.elements.gameRoot.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);

    if (width <= 0 || height <= 0) {
      return;
    }

    if (this.app.screen.width !== width || this.app.screen.height !== height) {
      this.app.renderer.resize(width, height);
    }
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
    this.loopCycleDurationSeconds = LOOP_RESTART_DELAY_SECONDS;
    this.previewLayer.removeChildren();
  }
}

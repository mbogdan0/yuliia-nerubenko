import { Container, Ticker, type Application } from "pixi.js";
import { isGalleryCompactViewport } from "../gallery/responsive";
import { reportError } from "../reportError";
import { syncRendererToElement } from "../rendererSizing";
import { ensureSpineAssets } from "../symbols/assets";
import { symbolDefinitions } from "../symbols/definitions";
import { JOKER_SYMBOL_ID, pickJokerWinAnimation } from "../symbols/jokerState";
import type { SymbolDefinition, SymbolId } from "../types";
import {
  resolveReelCount,
  resolveRowCount,
  SLOT_COMPACT_RENDER_RESOLUTION,
  SLOT_MAX_RENDER_RESOLUTION,
  SLOT_RESOLUTION,
  slotStageMaxHeight,
  slotStageMaxWidth,
  SLOT_STAGE_MIN_WIDTH
} from "./config";
import { JokerPopup } from "./JokerPopup";
import { checkHorizontalSymbolRows, checkHorizontalWins } from "./paylines";
import type { SpinMode } from "./results";
import { SlotGrid } from "./SlotGrid";

// Let the big-win clip finish, then wait this long before covering the reels.
const JOKER_POPUP_POST_WIN_BUFFER_MS = 200;
// Used only if the win clip's duration can't be read off the live skeleton.
const JOKER_POPUP_FALLBACK_DELAY_MS = 2200;

type SlotControls = {
  spinButton: HTMLButtonElement;
  spinWinButton: HTMLButtonElement;
};

type SlotLayoutRefs = {
  gameRoot: HTMLElement;
  stageShell: HTMLElement;
};

export class SlotTab {
  private grid: SlotGrid | null = null;
  private loadedDefinitions: SymbolDefinition[] | null = null;
  private isCompactMode = false;
  private reelCount: number | null = null;
  private rowCount: number | null = null;
  private pendingRebuild = false;
  private resizeFrame: number | null = null;
  private activationFrame: number | null = null;
  private popupPreloadHandle: number | null = null;
  private popupPreloadUsesIdleCallback = false;
  private popupPreparationPending = false;
  private resizeObserver: ResizeObserver | null = null;
  private isActive = false;
  private isSpinning = false;
  private spinGeneration = 0;

  constructor(
    private readonly app: Application,
    private readonly layer: Container,
    private readonly controls: SlotControls,
    private readonly layoutRefs: SlotLayoutRefs,
    private readonly jokerPopup: JokerPopup
  ) {}

  async init(): Promise<void> {
    this.loadedDefinitions = await ensureSpineAssets(symbolDefinitions, SLOT_RESOLUTION);
    if (this.loadedDefinitions.length === 0) {
      throw new Error("No slot symbols could be loaded. Please try again.");
    }

    this.isCompactMode = this.shouldUseCompactSlotMode();
    this.buildGrid();
    this.observeStageResize();
    this.onResize();
    this.bindControls();
  }

  // Grid dimensions are viewport-driven, so rebuild for the current mode.
  // Assets are already cached by ensureSpineAssets, so a rebuild is synchronous.
  private buildGrid(): void {
    if (!this.loadedDefinitions) return;
    this.grid?.destroy();
    const reelCount = resolveReelCount(this.isCompactMode);
    const rowCount = resolveRowCount(this.isCompactMode, window.innerWidth, window.innerHeight);
    this.grid = new SlotGrid(this.loadedDefinitions, this.layer, this.app, reelCount, rowCount);
    this.reelCount = reelCount;
    this.rowCount = rowCount;
    this.setStageSizingVars(reelCount, rowCount);
    // The aspect ratio changes with the row count. Resize before laying out the
    // new grid, including a rebuild deferred until the spin finishes.
    if (this.isActive) this.syncRendererToGameRoot();
  }

  private bindControls(): void {
    this.controls.spinButton.addEventListener("click", () => {
      this.spin("random").catch(reportError);
    });

    this.controls.spinWinButton.addEventListener("click", () => {
      this.spin("guaranteed-win").catch(reportError);
    });
  }

  tick(ticker: Ticker): void {
    const deltaSeconds = ticker.deltaMS / 1000;
    this.grid?.update(deltaSeconds);
    this.jokerPopup.update(deltaSeconds);
  }

  get needsTick(): boolean {
    return this.isSpinning;
  }

  setActive(active: boolean): void {
    this.isActive = active;

    if (this.activationFrame !== null) {
      window.cancelAnimationFrame(this.activationFrame);
      this.activationFrame = null;
    }

    if (!active) {
      this.spinGeneration++;
      this.jokerPopup.hideImmediately();
      this.cancelPopupPreload();
      this.setControlsDisabled(true);
      return;
    }

    this.setControlsDisabled(true);
    this.activationFrame = window.requestAnimationFrame(() => {
      this.activationFrame = null;
      this.syncControlsDisabled();
      this.schedulePopupPreload();
    });
  }

  private schedulePopupPreload(): void {
    if (!this.isActive || this.popupPreloadHandle !== null || this.popupPreparationPending || this.jokerPopup.isReady) return;

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") {
      return;
    }

    const preload = (): void => {
      this.popupPreloadHandle = null;
      if (!this.isActive || this.isSpinning || this.jokerPopup.isReady) return;
      this.popupPreparationPending = true;
      let assetsLoaded = false;
      this.jokerPopup.prepare(() => this.isActive && !this.isSpinning).then(() => {
        assetsLoaded = true;
      }).catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[popup] Joker popup could not be prepared; continuing without Joker wins.", error);
      }).finally(() => {
        this.popupPreparationPending = false;
        // A download can finish during a spin. Prepare its cached assets once
        // idle, including when the spin finished before this promise settled.
        if (assetsLoaded && this.isActive && !this.isSpinning && !this.jokerPopup.isReady) {
          this.schedulePopupPreload();
        }
      });
    };

    this.popupPreloadUsesIdleCallback = typeof window.requestIdleCallback === "function";
    this.popupPreloadHandle = this.popupPreloadUsesIdleCallback
      ? window.requestIdleCallback(preload, { timeout: 2000 })
      : window.setTimeout(preload, 250);
  }

  private cancelPopupPreload(): void {
    if (this.popupPreloadHandle === null) return;
    if (this.popupPreloadUsesIdleCallback) window.cancelIdleCallback(this.popupPreloadHandle);
    else window.clearTimeout(this.popupPreloadHandle);
    this.popupPreloadHandle = null;
  }

  onResize(): void {
    if (this.resizeFrame !== null) {
      return;
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.applyResize();
    });
  }

  private applyResize(): void {
    // The renderer is shared with the Gallery; only the active tab may size it.
    // The ResizeObserver watches #game-root in both modes, so gate here.
    if (!this.isActive) return;

    this.syncRendererToGameRoot();

    // Rotation and shorter portrait viewports can change the grid dimensions.
    // Rebuild to match, but never mid-spin, or the awaited
    // spin promises would be torn down and leave the controls disabled. Defer to
    // the spin's finally block in that case.
    const nextCompact = this.shouldUseCompactSlotMode();
    const nextReelCount = resolveReelCount(nextCompact);
    const nextRowCount = resolveRowCount(nextCompact, window.innerWidth, window.innerHeight);
    const rebuildRequired = nextReelCount !== this.reelCount || nextRowCount !== this.rowCount;
    this.isCompactMode = nextCompact;
    if (this.isSpinning) {
      // Returning to the existing dimensions cancels a deferred rebuild, so the
      // landed result remains visible after a temporary rotation or resize.
      this.pendingRebuild = rebuildRequired;
    } else {
      this.pendingRebuild = false;
      if (rebuildRequired) this.buildGrid();
    }

    this.grid?.setReducedMotionWork(this.isCompactMode);
    this.grid?.onResize();
    this.jokerPopup.layout();
  }

  private setStageSizingVars(reelCount: number, rowCount: number): void {
    const shellStyle = this.layoutRefs.stageShell.style;
    shellStyle.setProperty("--slot-stage-w", `${Math.round(slotStageMaxWidth(reelCount))}`);
    shellStyle.setProperty("--slot-stage-h", `${Math.round(slotStageMaxHeight(rowCount))}`);
    const minWidth = this.isCompactMode ? 254 : SLOT_STAGE_MIN_WIDTH;
    shellStyle.setProperty("--slot-stage-min-width", `${minWidth}px`);
  }

  private observeStageResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.onResize();
    });
    this.resizeObserver.observe(this.layoutRefs.gameRoot);
  }

  private syncRendererToGameRoot(): void {
    syncRendererToElement(this.app, this.layoutRefs.gameRoot, this.getTargetRenderResolution());
  }

  private getTargetRenderResolution(): number {
    const maxResolution = this.shouldUseCompactSlotMode()
      ? SLOT_COMPACT_RENDER_RESOLUTION
      : SLOT_MAX_RENDER_RESOLUTION;

    return Math.min(window.devicePixelRatio || 1, maxResolution);
  }

  private shouldUseCompactSlotMode(): boolean {
    return isGalleryCompactViewport(window.innerWidth, window.innerHeight);
  }

  private async spin(mode: SpinMode): Promise<void> {
    if (!this.grid || !this.isActive || this.isSpinning) return;

    const generation = ++this.spinGeneration;
    const jokerWinEligible = this.jokerPopup.isReady;
    this.isSpinning = true;
    this.syncControlsDisabled();
    this.grid.clearWins();

    try {
      const result = await this.grid.spin(mode, jokerWinEligible);
      await this.applyWins(result, generation, jokerWinEligible);
    } finally {
      this.isSpinning = false;
      // A breakpoint flip during the spin was deferred to here; apply it now that
      // the grid is idle and its spin promises have all resolved.
      if (this.pendingRebuild) {
        this.pendingRebuild = false;
        this.buildGrid();
        this.grid?.setReducedMotionWork(this.isCompactMode);
        this.grid?.onResize();
      }
      this.syncControlsDisabled();
      this.schedulePopupPreload();
    }
  }

  private syncControlsDisabled(): void {
    this.setControlsDisabled(!this.isActive || this.isSpinning);
  }

  private setControlsDisabled(disabled: boolean): void {
    this.controls.spinButton.disabled = disabled;
    this.controls.spinWinButton.disabled = disabled;
  }

  private async applyWins(result: SymbolId[][], generation: number, jokerWinEligible: boolean): Promise<void> {
    if (!this.grid || !this.isCurrentSpin(generation)) return;
    const jokerRows = checkHorizontalSymbolRows(result, JOKER_SYMBOL_ID);
    const canShowJokerWin = jokerWinEligible && this.jokerPopup.isReady;
    const winRows = checkHorizontalWins(result).filter((row) => canShowJokerWin || !jokerRows.includes(row));
    const awardedJokerRows = canShowJokerWin ? jokerRows : [];
    const highlightRows = winRows.filter((row) => !jokerRows.includes(row));

    // One weighted pick per joker row, shared by every cell in that row so they stay in sync.
    const jokerRowAnimations = new Map(awardedJokerRows.map((row) => [row, pickJokerWinAnimation()]));

    this.grid.showWins(highlightRows);
    for (const row of winRows) {
      for (let col = 0; col < result.length; col++) {
        const animation = jokerRowAnimations.get(row);
        this.grid.getVisibleCell(col, row).playWin(animation);
      }
    }

    this.applyJokerFailures(result, awardedJokerRows);

    if (awardedJokerRows.length > 0) {
      const firstJokerRow = awardedJokerRows[0];
      await this.grid.waitSeconds(this.jokerPopupDelayMs(firstJokerRow, jokerRowAnimations.get(firstJokerRow)) / 1000);
      if (this.isCurrentSpin(generation) && this.jokerPopup.isReady) {
        await this.jokerPopup.show(() => this.isCurrentSpin(generation));
      }
    }
  }

  private jokerPopupDelayMs(jokerRow: number, winAnimation?: string): number {
    if (!this.grid || !winAnimation) return JOKER_POPUP_FALLBACK_DELAY_MS;

    // Every cell in a joker row is a joker, so any column exposes the win clip.
    const winSeconds = this.grid.getVisibleCell(0, jokerRow).animationDurationSeconds(winAnimation);
    if (winSeconds <= 0) return JOKER_POPUP_FALLBACK_DELAY_MS;

    return winSeconds * 1000 + JOKER_POPUP_POST_WIN_BUFFER_MS;
  }

  private applyJokerFailures(result: SymbolId[][], jokerRows: number[]): void {
    if (!this.grid) return;

    for (let row = 0; row < (result[0]?.length ?? 0); row++) {
      if (jokerRows.includes(row)) continue;
      for (let col = 0; col < result.length; col++) {
        if (result[col][row] === JOKER_SYMBOL_ID) {
          this.grid.getVisibleCell(col, row).playFail();
        }
      }
    }
  }

  private isCurrentSpin(generation: number): boolean {
    return this.isActive && this.spinGeneration === generation;
  }
}

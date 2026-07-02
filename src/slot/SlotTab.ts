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
  ROW_COUNT,
  SLOT_COMPACT_RENDER_RESOLUTION,
  SLOT_MAX_RENDER_RESOLUTION,
  SLOT_RESOLUTION,
  SLOT_STAGE_MAX_HEIGHT,
  slotStageMaxWidth,
  SLOT_STAGE_MIN_WIDTH
} from "./config";
import { JokerPopup, preloadJokerPopupAssets } from "./JokerPopup";
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
  private pendingRebuild = false;
  private resizeFrame: number | null = null;
  private activationFrame: number | null = null;
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

    this.isCompactMode = this.shouldUseCompactSlotMode();
    this.buildGrid();
    this.observeStageResize();
    this.onResize();
    this.bindControls();
  }

  // Reel count is viewport-driven, so the grid is (re)built for the current mode.
  // Assets are already cached by ensureSpineAssets, so a rebuild is synchronous.
  private buildGrid(): void {
    if (!this.loadedDefinitions) return;
    this.grid?.destroy();
    const reelCount = resolveReelCount(this.isCompactMode);
    this.grid = new SlotGrid(this.loadedDefinitions, this.layer, this.app, reelCount);
    this.setStageSizingVars(reelCount);
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

  setActive(active: boolean): void {
    this.isActive = active;

    if (this.activationFrame !== null) {
      window.cancelAnimationFrame(this.activationFrame);
      this.activationFrame = null;
    }

    if (!active) {
      this.spinGeneration++;
      this.jokerPopup.hideImmediately();
      this.setControlsDisabled(true);
      return;
    }

    preloadJokerPopupAssets().catch(reportError);
    this.setControlsDisabled(true);
    this.activationFrame = window.requestAnimationFrame(() => {
      this.activationFrame = null;
      this.syncControlsDisabled();
    });
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

    // A tablet rotating across the breakpoint flips the reel count (desktop 4 ↔
    // compact 3). Rebuild the grid to match — but never mid-spin, or the awaited
    // spin promises would be torn down and leave the controls disabled. Defer to
    // the spin's finally block in that case.
    const nextCompact = this.shouldUseCompactSlotMode();
    if (nextCompact !== this.isCompactMode) {
      this.isCompactMode = nextCompact;
      if (this.isSpinning) this.pendingRebuild = true;
      else this.buildGrid();
    }

    this.grid?.setReducedMotionWork(this.isCompactMode);
    this.grid?.onResize();
    this.jokerPopup.layout();
  }

  private setStageSizingVars(reelCount: number): void {
    const shellStyle = this.layoutRefs.stageShell.style;
    shellStyle.setProperty("--slot-stage-w", `${Math.round(slotStageMaxWidth(reelCount))}`);
    shellStyle.setProperty("--slot-stage-h", `${Math.round(SLOT_STAGE_MAX_HEIGHT)}`);
    shellStyle.setProperty("--slot-stage-min-width", `${SLOT_STAGE_MIN_WIDTH}px`);
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
    this.isSpinning = true;
    this.syncControlsDisabled();
    this.grid.clearWins();

    try {
      const result = await this.grid.spin(mode);
      await this.applyWins(result, generation);
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
    }
  }

  private syncControlsDisabled(): void {
    this.setControlsDisabled(!this.isActive || this.isSpinning);
  }

  private setControlsDisabled(disabled: boolean): void {
    this.controls.spinButton.disabled = disabled;
    this.controls.spinWinButton.disabled = disabled;
  }

  private async applyWins(result: SymbolId[][], generation: number): Promise<void> {
    if (!this.grid) return;
    const winRows = checkHorizontalWins(result);
    const jokerRows = checkHorizontalSymbolRows(result, JOKER_SYMBOL_ID);
    const highlightRows = winRows.filter((row) => !jokerRows.includes(row));

    // One weighted pick per joker row, shared by every cell in that row so they stay in sync.
    const jokerRowAnimations = new Map(jokerRows.map((row) => [row, pickJokerWinAnimation()]));

    this.grid.showWins(highlightRows);
    for (const row of winRows) {
      for (let col = 0; col < result.length; col++) {
        const animation = jokerRowAnimations.get(row);
        this.grid.getVisibleCell(col, row).playWin(animation);
      }
    }

    this.applyJokerFailures(result, jokerRows);

    if (jokerRows.length > 0) {
      const firstJokerRow = jokerRows[0];
      await waitMs(this.jokerPopupDelayMs(firstJokerRow, jokerRowAnimations.get(firstJokerRow)));
      if (this.isCurrentSpin(generation)) {
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

    for (let row = 0; row < ROW_COUNT; row++) {
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

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

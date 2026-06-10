import { Container, Ticker, type Application } from "pixi.js";
import { isGalleryCompactViewport } from "../gallery/responsive";
import { reportError } from "../reportError";
import { ensureSpineAssets } from "../symbols/assets";
import { symbolDefinitions } from "../symbols/definitions";
import type { SymbolId } from "../types";
import {
  REEL_COUNT,
  SLOT_COMPACT_RENDER_RESOLUTION,
  SLOT_MAX_RENDER_RESOLUTION,
  SLOT_RESOLUTION,
  SLOT_STAGE_MAX_HEIGHT,
  SLOT_STAGE_MAX_WIDTH,
  SLOT_STAGE_MIN_WIDTH
} from "./config";
import { checkHorizontalWins } from "./paylines";
import type { SpinMode } from "./results";
import { SlotGrid } from "./SlotGrid";

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
  private resizeFrame: number | null = null;
  private activationFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isActive = false;
  private isSpinning = false;

  constructor(
    private readonly app: Application,
    private readonly layer: Container,
    private readonly controls: SlotControls,
    private readonly layoutRefs: SlotLayoutRefs
  ) {}

  async init(): Promise<void> {
    const loaded = await ensureSpineAssets(symbolDefinitions, SLOT_RESOLUTION);

    this.setStageSizingVars();
    this.grid = new SlotGrid(loaded, this.layer, this.app);
    this.observeStageResize();
    this.onResize();
    this.bindControls();
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
    this.grid?.update(ticker.deltaMS / 1000);
  }

  setActive(active: boolean): void {
    this.isActive = active;

    if (this.activationFrame !== null) {
      window.cancelAnimationFrame(this.activationFrame);
      this.activationFrame = null;
    }

    if (!active) {
      this.setControlsDisabled(true);
      return;
    }

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
    this.grid?.setReducedMotionWork(this.shouldUseCompactSlotMode());
    this.grid?.onResize();
  }

  private setStageSizingVars(): void {
    const shellStyle = this.layoutRefs.stageShell.style;
    shellStyle.setProperty("--slot-stage-w", `${Math.round(SLOT_STAGE_MAX_WIDTH)}`);
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
    const bounds = this.layoutRefs.gameRoot.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    const resolution = this.getTargetRenderResolution();

    if (width <= 0 || height <= 0) {
      return;
    }

    if (
      this.app.screen.width !== width ||
      this.app.screen.height !== height ||
      this.app.renderer.resolution !== resolution
    ) {
      this.app.renderer.resize(width, height, resolution);
    }
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

    this.isSpinning = true;
    this.syncControlsDisabled();
    this.grid.clearWins();

    try {
      const result = await this.grid.spin(mode);
      this.applyWins(result);
    } finally {
      this.isSpinning = false;
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

  private applyWins(result: SymbolId[][]): void {
    if (!this.grid) return;
    const winRows = checkHorizontalWins(result);
    this.grid.showWins(winRows);
    for (const row of winRows) {
      for (let col = 0; col < REEL_COUNT; col++) {
        this.grid.getVisibleCell(col, row).playWin();
      }
    }
  }
}

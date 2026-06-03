import { Container, Ticker, type Application } from "pixi.js";
import { reportError } from "../reportError";
import { isCompactViewport } from "../responsive";
import { ensureSpineAssets } from "../symbols/assets";
import { symbolDefinitions } from "../symbols/definitions";
import type { SymbolId } from "../types";
import {
  REEL_COUNT,
  SLOT_COMPACT_RENDER_RESOLUTION,
  SLOT_COMPACT_RESERVE_GAP,
  SLOT_COMPACT_SIDE_PADDING,
  SLOT_DESKTOP_SIDE_PADDING,
  SLOT_MAX_RENDER_RESOLUTION
} from "./config";
import type { SlotGridReserves } from "./layout";
import { checkHorizontalWins } from "./paylines";
import type { SpinMode } from "./results";
import { SlotGrid } from "./SlotGrid";

type SlotControls = {
  spinButton: HTMLButtonElement;
  spinWinButton: HTMLButtonElement;
};

type SlotLayoutRefs = {
  gameRoot: HTMLElement;
};

export class SlotTab {
  private grid: SlotGrid | null = null;
  private resizeFrame: number | null = null;

  constructor(
    private readonly app: Application,
    private readonly layer: Container,
    private readonly controls: SlotControls,
    private readonly layoutRefs: SlotLayoutRefs
  ) {}

  async init(): Promise<void> {
    await ensureSpineAssets(symbolDefinitions);

    this.grid = new SlotGrid(symbolDefinitions, this.layer, this.app);
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

  onResize(): void {
    this.applyResize();

    if (this.resizeFrame !== null) {
      return;
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.applyResize();
    });
  }

  private applyResize(): void {
    this.syncRendererToGameRoot();
    this.grid?.setReducedMotionWork(this.shouldUseCompactSlotMode());
    this.grid?.onResize(this.computeReserves());
  }

  private computeReserves(): SlotGridReserves {
    if (this.shouldUseCompactSlotMode()) {
      return {
        topReserve: SLOT_COMPACT_RESERVE_GAP,
        bottomReserve: SLOT_COMPACT_RESERVE_GAP,
        sidePadding: SLOT_COMPACT_SIDE_PADDING
      };
    }

    return { topReserve: 0, bottomReserve: 0, sidePadding: SLOT_DESKTOP_SIDE_PADDING };
  }

  private syncRendererToGameRoot(): void {
    const bounds = this.layoutRefs.gameRoot.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    const resolution = this.getTargetRenderResolution(width, height);

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

  private getTargetRenderResolution(width: number, height: number): number {
    const maxResolution = isCompactViewport(width, height)
      ? SLOT_COMPACT_RENDER_RESOLUTION
      : SLOT_MAX_RENDER_RESOLUTION;

    return Math.min(window.devicePixelRatio || 1, maxResolution);
  }

  private shouldUseCompactSlotMode(): boolean {
    return isCompactViewport(this.app.screen.width, this.app.screen.height);
  }

  private async spin(mode: SpinMode): Promise<void> {
    if (!this.grid) return;

    this.setControlsDisabled(true);
    this.grid.clearWins();

    try {
      const result = await this.grid.spin(mode);
      this.applyWins(result);
    } finally {
      this.setControlsDisabled(false);
    }
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

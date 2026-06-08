import { Container, Graphics, type Application } from "pixi.js";
import { Cell } from "./Cell";
import { Reel } from "./Reel";
import {
  CELL_H,
  CELL_W,
  REEL_COUNT,
  REEL_STOP_DELAY,
  REEL_STOP_DELAY_JITTER,
  ROW_COUNT,
  SPIN_MIN_DURATION
} from "./config";
import { rand } from "../utils";
import type { SymbolDefinition, SymbolId } from "../types";
import { calculateSlotGridLayout, type SlotGridReserves } from "./layout";
import { createSpinResult, type SpinMode } from "./results";

// Visual sizing
const GRID_INSET = 4;            // px the background/frame extends beyond the grid edge
const GRID_RADIUS = 12;           // corner radius for background and frame
const WIN_HIGHLIGHT_PAD = 6;     // inset so adjacent win rows don't visually touch
const WIN_HIGHLIGHT_RADIUS = 12;

// Colors and stroke styles
const GRID_BG_COLOR = 0x0d0f0d;
const GRID_BG_ALPHA = 0.72;
const SEPARATOR_COLOR = 0x3a3520;
const WIN_GLOW_COLOR = 0xffe27a;
const WIN_GLOW_WIDTH = 7;
const WIN_GLOW_ALPHA = 0.16;
const WIN_BORDER_COLOR = 0xffd45e;
const WIN_BORDER_WIDTH = 2;
const WIN_BORDER_ALPHA = 0.97;
const FRAME_COLOR = 0xc9a227;
const FRAME_WIDTH = 6;
const FRAME_ALPHA = 0.35;

type PendingTimer = { remaining: number; resolve: () => void };

export class SlotGrid {
  private gridRoot: Container;
  private reels: Reel[] = [];
  private winHighlights: Container[] = [];
  private pendingTimers: PendingTimer[] = [];
  private readonly definitions: SymbolDefinition[];

  constructor(
    definitions: SymbolDefinition[],
    private readonly layer: Container,
    private readonly app: Application
  ) {
    this.definitions = definitions;
    this.gridRoot = new Container();
    this.layer.addChild(this.gridRoot);

    const gridW = REEL_COUNT * CELL_W;
    const gridH = ROW_COUNT * CELL_H;

    // Background panel behind the reels.
    const bg = new Graphics()
      .roundRect(-GRID_INSET, -GRID_INSET, gridW + GRID_INSET * 2, gridH + GRID_INSET * 2, GRID_RADIUS)
      .fill({ color: GRID_BG_COLOR, alpha: GRID_BG_ALPHA });
    this.gridRoot.addChild(bg);

    // Reels live inside a viewport clipped to the grid window — this hides the
    // scroll-in/out overflow cleanly without opaque cover rectangles.
    const viewport = new Container();
    this.gridRoot.addChild(viewport);

    for (let i = 0; i < REEL_COUNT; i++) {
      const reel = new Reel(definitions);
      reel.x = i * CELL_W;
      this.reels.push(reel);
      viewport.addChild(reel);
    }

    const clip = new Graphics().rect(0, 0, gridW, gridH).fill(0xffffff);
    this.gridRoot.addChild(clip);
    viewport.mask = clip;

    // Vertical separators on top of the reels.
    for (let i = 1; i < REEL_COUNT; i++) {
      const sep = new Graphics()
        .moveTo(i * CELL_W, 0)
        .lineTo(i * CELL_W, gridH);
      sep.stroke({ color: SEPARATOR_COLOR, width: 1 });
      this.gridRoot.addChild(sep);
    }

    // Win highlight — a neat gold frame around a winning row, hidden until a win.
    // Inset within the row so adjacent winning rows never touch/overlap.
    for (let row = 0; row < ROW_COUNT; row++) {
      const highlight = new Container();
      const rect = { x: WIN_HIGHLIGHT_PAD, y: row * CELL_H + WIN_HIGHLIGHT_PAD, w: gridW - WIN_HIGHLIGHT_PAD * 2, h: CELL_H - WIN_HIGHLIGHT_PAD * 2 };
      const glow = new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, WIN_HIGHLIGHT_RADIUS);
      glow.stroke({ color: WIN_GLOW_COLOR, width: WIN_GLOW_WIDTH, alpha: WIN_GLOW_ALPHA });
      const border = new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, WIN_HIGHLIGHT_RADIUS);
      border.stroke({ color: WIN_BORDER_COLOR, width: WIN_BORDER_WIDTH, alpha: WIN_BORDER_ALPHA });
      highlight.addChild(glow, border);
      highlight.visible = false;
      this.gridRoot.addChild(highlight);
      this.winHighlights.push(highlight);
    }

    // Decorative border framing the grid.
    const frame = new Graphics()
      .roundRect(-GRID_INSET, -GRID_INSET, gridW + GRID_INSET * 2, gridH + GRID_INSET * 2, GRID_RADIUS)
      .stroke({ color: FRAME_COLOR, width: FRAME_WIDTH, alpha: FRAME_ALPHA });
    this.gridRoot.addChild(frame);
  }

  private waitSeconds(sec: number): Promise<void> {
    return new Promise((resolve) => {
      this.pendingTimers.push({ remaining: sec, resolve });
    });
  }

  async spin(mode: SpinMode = "random"): Promise<SymbolId[][]> {
    for (const reel of this.reels) reel.spin();

    await this.waitSeconds(SPIN_MIN_DURATION / 1000);

    const result = createSpinResult(mode, this.definitions);

    for (let i = 0; i < this.reels.length; i++) {
      // Jitter the gap between stops so the cascade doesn't feel metronomic.
      if (i > 0) {
        const jitterDelay = Math.max(0, REEL_STOP_DELAY + rand(-REEL_STOP_DELAY_JITTER, REEL_STOP_DELAY_JITTER));
        await this.waitSeconds(jitterDelay / 1000);
      }
      await this.reels[i].stop(result[i]);
    }

    return this.getVisibleResult();
  }

  getVisibleResult(): SymbolId[][] {
    return this.reels.map((_, col) =>
      Array.from({ length: ROW_COUNT }, (_, row) => {
        const symbolId = this.getVisibleCell(col, row).currentSymbolId;
        if (symbolId === null) {
          throw new Error(`Visible slot cell is missing a symbol at col ${col}, row ${row}.`);
        }
        return symbolId;
      })
    );
  }

  showWins(rows: number[]): void {
    for (const row of rows) {
      if (this.winHighlights[row]) this.winHighlights[row].visible = true;
    }
  }

  clearWins(): void {
    for (const highlight of this.winHighlights) highlight.visible = false;
  }

  getVisibleCell(col: number, row: number): Cell {
    return this.reels[col].getVisibleCell(row);
  }

  update(dt: number): void {
    for (const reel of this.reels) reel.update(dt);

    for (let i = this.pendingTimers.length - 1; i >= 0; i--) {
      const timer = this.pendingTimers[i];
      timer.remaining -= dt;
      if (timer.remaining <= 0) {
        this.pendingTimers.splice(i, 1);
        timer.resolve();
      }
    }
  }

  setReducedMotionWork(enabled: boolean): void {
    for (const reel of this.reels) reel.setReducedMotionWork(enabled);
  }

  onResize(reserves: SlotGridReserves): void {
    const layout = calculateSlotGridLayout(this.app.screen.width, this.app.screen.height, reserves);

    this.gridRoot.scale.set(layout.scale);
    this.gridRoot.x = layout.x;
    this.gridRoot.y = layout.y;
  }
}

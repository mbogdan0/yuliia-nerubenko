import { Container } from "pixi.js";
import { Cell } from "./Cell";
import {
  CELL_H,
  ROW_COUNT,
  SPIN_ACCEL_TIME,
  SPIN_CELLS_PER_SEC,
  STOP_DURATION_MAX,
  STOP_DURATION_MIN,
  STOP_MIN_CELLS,
  STOP_OVERSHOOT
} from "./config";
import type { SymbolDefinition, SymbolId } from "../types";

type ReelState = "idle" | "spinning" | "stopping" | "stopped";

// Cell pool: ROW_COUNT visible + one buffer above + one below for smooth scroll-in/out.
const POOL_SIZE = ROW_COUNT + 2;
const MOVING_SPINE_UPDATE_INTERVAL = 1 / 12;

function randomSymbol(definitions: SymbolDefinition[]): SymbolId {
  return definitions[Math.floor(Math.random() * definitions.length)].id;
}

/** easeOut family: f(t) = 1 - (1-t)^power. f'(0) = power (used for velocity matching). */
function easeOut(t: number, power: number): number {
  return 1 - Math.pow(1 - t, power);
}

/** easeOutBack: overshoots 1 by an amount governed by `s`, then settles. f(1)=1; f'(0)=s+3. */
function easeOutBack(t: number, s: number): number {
  const c3 = s + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + s * u * u;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * A single reel rendered as a virtual strip.
 *
 * `position` is a continuous scroll offset measured in CELLS: when it is an
 * integer, visible row r shows strip index `position + r`. Symbols live in a
 * lazily-generated cache (`strip`), so the result for a stop can be written
 * AHEAD of the current window and then scrolls naturally into view — there is
 * never a last-moment symbol swap, and the reel always lands on an exact
 * integer position (no snap / no undercrank).
 */
export class Reel extends Container {
  private cells: Cell[] = [];
  private cellIndex: number[] = [];        // strip index currently shown by each pool cell
  private strip = new Map<number, SymbolId>();
  private readonly definitions: SymbolDefinition[];

  private state: ReelState = "idle";
  private scroll = 0;
  private reduceMotionWork = false;
  private movingSpineUpdateElapsed = 0;

  // free-spin
  private speed = 0;                        // cells/s
  private accelElapsed = 0;

  // stop tween
  private stopStartPos = 0;
  private stopTargetPos = 0;
  private stopDuration = 0;
  private stopElapsed = 0;
  private resolveStop: (() => void) | null = null;

  constructor(definitions: SymbolDefinition[]) {
    super();
    this.definitions = definitions;
    for (let i = 0; i < POOL_SIZE; i++) {
      const cell = new Cell(definitions);
      this.cells.push(cell);
      this.cellIndex.push(Number.NaN);
      this.addChild(cell);
    }
    this.layoutCells();
  }

  private symbolAt(index: number): SymbolId {
    let s = this.strip.get(index);
    if (s === undefined) {
      s = randomSymbol(this.definitions);
      this.strip.set(index, s);
    }
    return s;
  }

  /** Position every pool cell at its strip index around the current window. */
  private layoutCells(): void {
    const lo = Math.floor(this.scroll) - 1; // top buffer index
    for (let c = 0; c < POOL_SIZE; c++) {
      // The unique strip index in [lo, lo+POOL_SIZE-1] with index ≡ c (mod POOL_SIZE).
      const index = lo + mod(c - lo, POOL_SIZE);
      const cell = this.cells[c];
      if (this.cellIndex[c] !== index) {
        this.cellIndex[c] = index;
        cell.setSymbol(this.symbolAt(index), { resetIdleAnimation: !this.reduceMotionWork });
      }
      cell.y = (index - this.scroll) * CELL_H;
    }
  }

  setReducedMotionWork(enabled: boolean): void {
    this.reduceMotionWork = enabled;
    this.movingSpineUpdateElapsed = 0;
  }

  spin(): void {
    this.state = "spinning";
    this.speed = 0;
    this.accelElapsed = 0;
    for (const cell of this.cells) cell.playIdle();
  }

  /**
   * Begin stopping on `result` (top-to-bottom). Resolves once the reel has
   * settled exactly on the result.
   */
  stop(result: SymbolId[]): Promise<void> {
    // Land far enough ahead for a natural decel; write the result there so it
    // scrolls into view rather than being swapped in at the end.
    const landing = Math.ceil(this.scroll) + STOP_MIN_CELLS;
    for (let r = 0; r < ROW_COUNT; r++) {
      const si = landing + r;
      this.strip.set(si, result[r]);
      // layoutCells() skips cells whose cellIndex hasn't changed, so a pool cell
      // already mapped to this strip index would keep its old random symbol.
      // Refresh it directly so getVisibleResult() reads the correct value.
      const ci = this.cellIndex.indexOf(si);
      if (ci !== -1) this.cells[ci].setSymbol(result[r]);
    }

    this.stopStartPos = this.scroll;
    this.stopTargetPos = landing;

    // Match the tween's initial velocity to the current spin speed so the
    // hand-off from free-spin to deceleration is seamless (no surge/jerk).
    // easeOutBack: f'(0) = STOP_OVERSHOOT + 3  ⇒  v(0) = (s+3)·distance/duration.
    const distance = landing - this.scroll;
    const v = Math.max(this.speed, SPIN_CELLS_PER_SEC);
    this.stopDuration = Math.min(
      Math.max(((STOP_OVERSHOOT + 3) * distance) / v, STOP_DURATION_MIN),
      STOP_DURATION_MAX
    );
    this.stopElapsed = 0;
    this.state = "stopping";

    return new Promise((resolve) => {
      this.resolveStop = resolve;
    });
  }

  getVisibleCell(row: number): Cell {
    const targetY = row * CELL_H;
    return this.cells.reduce((closest, cell) =>
      Math.abs(cell.y - targetY) < Math.abs(closest.y - targetY) ? cell : closest
    );
  }

  update(dt: number): void {
    let isMoving = false;

    if (this.state === "spinning") {
      isMoving = true;
      if (this.accelElapsed < SPIN_ACCEL_TIME) {
        this.accelElapsed = Math.min(this.accelElapsed + dt, SPIN_ACCEL_TIME);
        this.speed = SPIN_CELLS_PER_SEC * easeOut(this.accelElapsed / SPIN_ACCEL_TIME, 3);
      } else {
        this.speed = SPIN_CELLS_PER_SEC;
      }
      this.scroll += this.speed * dt;
      this.layoutCells();
    } else if (this.state === "stopping") {
      isMoving = true;
      this.stopElapsed = Math.min(this.stopElapsed + dt, this.stopDuration);
      const eased = easeOutBack(this.stopElapsed / this.stopDuration, STOP_OVERSHOOT);
      this.scroll = this.stopStartPos + (this.stopTargetPos - this.stopStartPos) * eased;
      this.layoutCells();

      if (this.stopElapsed >= this.stopDuration) {
        this.scroll = this.stopTargetPos; // exact integer alignment
        this.layoutCells();
        this.pruneStrip();
        this.state = "stopped";
        for (const cell of this.cells) cell.playIdle();
        isMoving = false;
        const cb = this.resolveStop;
        this.resolveStop = null;
        cb?.();
      }
    }

    const spineDt = this.getSpineUpdateDelta(dt, isMoving);
    if (spineDt === null) return;

    for (const cell of this.cells) cell.update(spineDt);
  }

  private getSpineUpdateDelta(dt: number, isMoving: boolean): number | null {
    if (!this.reduceMotionWork || !isMoving) {
      this.movingSpineUpdateElapsed = 0;
      return dt;
    }

    // Tablet optimization is motion-phase-only: moving reels throttle Spine
    // animation work, then full-quality updates resume as soon as the reel lands.
    this.movingSpineUpdateElapsed += dt;
    if (this.movingSpineUpdateElapsed < MOVING_SPINE_UPDATE_INTERVAL) {
      return null;
    }

    const spineDt = this.movingSpineUpdateElapsed;
    this.movingSpineUpdateElapsed = 0;
    return spineDt;
  }

  /** Drop cached symbols outside the resting window to bound memory growth. */
  private pruneStrip(): void {
    const lo = this.stopTargetPos - 1;
    const hi = this.stopTargetPos + ROW_COUNT;
    for (const key of this.strip.keys()) {
      if (key < lo || key > hi) this.strip.delete(key);
    }
  }
}

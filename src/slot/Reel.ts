import { Container } from "pixi.js";
import { Cell } from "./Cell";
import {
  CELL_H,
  SPIN_ACCEL_TIME,
  SPIN_CELLS_PER_SEC,
  SPIN_SPEED_JITTER,
  SPIN_STEP,
  SPIN_WINDUP_CELLS,
  SPIN_WINDUP_TIME,
  STOP_DURATION_MAX,
  STOP_DURATION_MIN,
  STOP_EXTRA_CELLS_MAX,
  STOP_MIN_CELLS,
  STOP_OVERSHOOT,
  STOP_OVERSHOOT_JITTER
} from "./config";
import { rand, randInt } from "../utils";
import type { SymbolDefinition, SymbolId } from "../types";

type ReelState = "idle" | "windup" | "spinning" | "stopping" | "stopped";

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
  // Visible rows plus one buffer above and below for smooth scroll-in/out.
  private readonly poolSize: number;

  private state: ReelState = "idle";
  private scroll = 0;
  private reduceMotionWork = false;
  private movingSpineUpdateElapsed = 0;

  // free-spin
  private speed = 0;                        // cells/s
  private spinSpeed = SPIN_CELLS_PER_SEC;   // jittered top speed, sampled per spin
  private accelElapsed = 0;

  // wind-up (brief back-kick before launch)
  private windupFromPos = 0;
  private windupElapsed = 0;

  // stop tween
  private stopStartPos = 0;
  private stopTargetPos = 0;
  private stopDuration = 0;
  private stopElapsed = 0;
  private stopOvershoot = STOP_OVERSHOOT;   // jittered per stop
  private resolveStop: (() => void) | null = null;

  constructor(definitions: SymbolDefinition[], private readonly rowCount: number) {
    super();
    this.definitions = definitions;
    this.poolSize = this.rowCount + 2;
    for (let i = 0; i < this.poolSize; i++) {
      const cell = new Cell();
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
    for (let c = 0; c < this.poolSize; c++) {
      // The unique strip index in the buffered window with index ≡ c (mod poolSize).
      const index = lo + mod(c - lo, this.poolSize);
      const cell = this.cells[c];
      if (this.cellIndex[c] !== index) {
        this.cellIndex[c] = index;
        cell.setSymbol(this.symbolAt(index), { resetIdleAnimation: !this.reduceMotionWork });
      }
      cell.y = (index - this.scroll) * CELL_H;
      // Buffer cells are needed only while the strip is moving. Hiding them at
      // rest also avoids rendering and updating their offscreen skeletons.
      cell.visible = (this.state !== "idle" && this.state !== "stopped")
        || (cell.y >= 0 && cell.y < this.rowCount * CELL_H);
    }
  }

  setReducedMotionWork(enabled: boolean): void {
    this.reduceMotionWork = enabled;
    this.movingSpineUpdateElapsed = 0;
  }

  spin(): void {
    // Slightly vary each reel's top speed so they don't free-spin in lockstep.
    this.spinSpeed = SPIN_CELLS_PER_SEC * rand(1 - SPIN_SPEED_JITTER, 1 + SPIN_SPEED_JITTER);
    this.speed = 0;
    this.accelElapsed = 0;

    // Recoil opposite to travel before launching, like a real reel. Skipped
    // entirely (no wasted frame) when the wind-up is tuned to zero.
    if (SPIN_WINDUP_CELLS > 0) {
      this.state = "windup";
      this.windupFromPos = this.scroll;
      this.windupElapsed = 0;
    } else {
      this.state = "spinning";
    }

    for (const cell of this.cells) {
      cell.visible = true;
      cell.playIdle();
    }
  }

  /**
   * Begin stopping on `result` (top-to-bottom). Resolves once the reel has
   * settled exactly on the result.
   */
  stop(result: SymbolId[]): Promise<void> {
    // Land far enough ahead (in the travel direction) for a natural decel; write
    // the result there so it scrolls into view rather than being swapped at the
    // end. A random extra cell or two varies the deceleration distance per stop.
    const extra = randInt(0, STOP_EXTRA_CELLS_MAX);
    const base = SPIN_STEP < 0 ? Math.floor(this.scroll) : Math.ceil(this.scroll);
    const minimumTravel = Math.max(STOP_MIN_CELLS, this.rowCount);
    const landing = base + SPIN_STEP * (minimumTravel + extra);
    for (let r = 0; r < this.rowCount; r++) {
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
    // Vary the landing bounce a touch so the "thunk" isn't identical every stop.
    this.stopOvershoot = STOP_OVERSHOOT * rand(1 - STOP_OVERSHOOT_JITTER, 1 + STOP_OVERSHOOT_JITTER);

    // Match the tween's initial velocity to the current spin speed so the
    // hand-off from free-spin to deceleration is seamless (no surge/jerk).
    // easeOutBack: f'(0) = stopOvershoot + 3  ⇒  v(0) = (s+3)·distance/duration.
    const distance = Math.abs(landing - this.scroll);
    const v = Math.max(this.speed, this.spinSpeed);
    // A taller window needs an extra cell of travel to stage the result ahead.
    // Extend only its upper limit so the velocity match survives the longer stop.
    const extraTravelDuration = ((this.stopOvershoot + 3) * (minimumTravel - STOP_MIN_CELLS)) / v;
    this.stopDuration = Math.min(
      Math.max(((this.stopOvershoot + 3) * distance) / v, STOP_DURATION_MIN),
      STOP_DURATION_MAX + extraTravelDuration
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

    if (this.state === "windup") {
      isMoving = true;
      this.windupElapsed = Math.min(this.windupElapsed + dt, SPIN_WINDUP_TIME);
      // Ease backward (opposite to travel), then hand off to the accel ramp.
      const eased = easeOut(this.windupElapsed / SPIN_WINDUP_TIME, 2);
      this.scroll = this.windupFromPos - SPIN_STEP * SPIN_WINDUP_CELLS * eased;
      this.layoutCells();
      if (this.windupElapsed >= SPIN_WINDUP_TIME) {
        this.state = "spinning";
        this.speed = 0;
        this.accelElapsed = 0;
      }
    } else if (this.state === "spinning") {
      isMoving = true;
      if (this.accelElapsed < SPIN_ACCEL_TIME) {
        this.accelElapsed = Math.min(this.accelElapsed + dt, SPIN_ACCEL_TIME);
        this.speed = this.spinSpeed * easeOut(this.accelElapsed / SPIN_ACCEL_TIME, 3);
      } else {
        this.speed = this.spinSpeed;
      }
      this.scroll += SPIN_STEP * this.speed * dt;
      this.layoutCells();
    } else if (this.state === "stopping") {
      isMoving = true;
      this.stopElapsed = Math.min(this.stopElapsed + dt, this.stopDuration);
      const eased = easeOutBack(this.stopElapsed / this.stopDuration, this.stopOvershoot);
      this.scroll = this.stopStartPos + (this.stopTargetPos - this.stopStartPos) * eased;
      this.layoutCells();

      if (this.stopElapsed >= this.stopDuration) {
        this.settle();
        isMoving = false;
      }
    }

    const spineDt = this.getSpineUpdateDelta(dt, isMoving);
    if (spineDt === null) return;

    for (const cell of this.cells) {
      if (cell.visible) cell.update(spineDt);
    }
  }

  /** Lock the reel exactly onto its result, then fire the landing hook. */
  private settle(): void {
    this.scroll = this.stopTargetPos; // exact integer alignment
    this.state = "stopped";
    this.layoutCells();
    this.pruneStrip();
    this.land();
    const cb = this.resolveStop;
    this.resolveStop = null;
    cb?.();
  }

  /**
   * Restore Idle at the exact frame the reel locks onto its result. Optional
   * Land clips in some exports remain unused under the engine's Idle/Win contract.
   */
  private land(): void {
    for (const cell of this.cells) cell.playLand();
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
    const hi = this.stopTargetPos + this.rowCount;
    for (const key of this.strip.keys()) {
      if (key < lo || key > hi) this.strip.delete(key);
    }
  }
}

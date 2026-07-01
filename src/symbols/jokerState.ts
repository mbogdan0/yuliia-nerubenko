export const JOKER_SYMBOL_ID = "joker";
export const JOKER_IDLE_INTRO = "idle_0";
export const JOKER_IDLE_MAIN = "idle_1";
export const JOKER_IDLE_SECONDARY = "idle_2";
export const JOKER_IDLE_TERTIARY = "idle_3";
export const JOKER_WIN_NORMAL = "win_1";
export const JOKER_WIN_BIG = "win_2";
export const JOKER_FAIL = "fail";

export type JokerPlaybackState = "idle-intro" | "idle-main" | "idle-variant" | "event";

export function chooseNextJokerIdleAnimation(): string {
  const roll = Math.random();
  if (roll < 0.7) return JOKER_IDLE_MAIN;
  return roll < 0.9 ? JOKER_IDLE_SECONDARY : JOKER_IDLE_TERTIARY;
}

/** Weighted pick for the joker win clip: favors win_1 over the bigger win_2. */
export function pickJokerWinAnimation(): string {
  return Math.random() < 0.7 ? JOKER_WIN_NORMAL : JOKER_WIN_BIG;
}

export type JokerIdleStep = {
  animation: string;
  state: JokerPlaybackState;
};

/**
 * Drives the Joker's multi-clip idle loop (intro → main → random variant → main)
 * plus one-shot events (win/fail) that return to the main idle when finished.
 *
 * The sequencer owns only the state and elapsed-time bookkeeping; the caller plays
 * the returned animation on its own Spine and reports clip durations back via
 * `advance`. This keeps the slot cell and the gallery preview sharing one FSM.
 */
export class JokerIdleSequencer {
  private playbackState: JokerPlaybackState | null = null;
  private currentAnimation: string | null = null;
  private elapsedSeconds = 0;

  get animation(): string | null {
    return this.currentAnimation;
  }

  get isActive(): boolean {
    return this.playbackState !== null;
  }

  /** Begin the idle loop. Pass `hasIntro: false` to skip straight to the main idle. */
  start(hasIntro: boolean): JokerIdleStep {
    return this.apply(
      hasIntro
        ? { animation: JOKER_IDLE_INTRO, state: "idle-intro" }
        : { animation: JOKER_IDLE_MAIN, state: "idle-main" }
    );
  }

  /** Play a one-shot event (win/fail); the loop returns to the main idle afterwards. */
  startEvent(animation: string): JokerIdleStep {
    return this.apply({ animation, state: "event" });
  }

  /**
   * Accumulate elapsed time and, once the current clip's `currentDuration` has
   * passed, return the next step to play — or `null` to keep the current clip.
   */
  advance(deltaSeconds: number, currentDuration: number): JokerIdleStep | null {
    if (this.playbackState === null) return null;

    this.elapsedSeconds += deltaSeconds;
    if (this.elapsedSeconds < currentDuration) return null;

    const next: JokerIdleStep =
      this.playbackState === "idle-main"
        ? this.pickNextIdle()
        : { animation: JOKER_IDLE_MAIN, state: "idle-main" };
    return this.apply(next);
  }

  reset(): void {
    this.playbackState = null;
    this.currentAnimation = null;
    this.elapsedSeconds = 0;
  }

  private pickNextIdle(): JokerIdleStep {
    const next = chooseNextJokerIdleAnimation();
    return { animation: next, state: next === JOKER_IDLE_MAIN ? "idle-main" : "idle-variant" };
  }

  private apply(step: JokerIdleStep): JokerIdleStep {
    this.currentAnimation = step.animation;
    this.playbackState = step.state;
    this.elapsedSeconds = 0;
    return step;
  }
}

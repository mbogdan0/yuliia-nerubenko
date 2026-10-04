const MAX_START_DELAY_MS = 100;

type Tone = {
  frequency: number;
  endFrequency?: number;
  offset: number;
  duration: number;
  gain: number;
  wave: OscillatorType;
};

const SPIN_TONES: readonly Tone[] = [
  { frequency: 280, endFrequency: 180, offset: 0, duration: 0.05, gain: 0.063, wave: "triangle" }
];
const WIN_TONES: readonly Tone[] = [
  { frequency: 523.25, offset: 0, duration: 0.14, gain: 0.056, wave: "sine" },
  { frequency: 659.25, offset: 0.07, duration: 0.14, gain: 0.056, wave: "sine" },
  { frequency: 783.99, offset: 0.14, duration: 0.14, gain: 0.056, wave: "sine" }
];

export class SlotSounds {
  private active = false;
  private pageVisible = !document.hidden;
  private context: AudioContext | null = null;
  private suspension: Promise<void> | null = null;
  private voices = new Map<OscillatorNode, GainNode>();
  private generation = 0;
  private waitingForResult = false;

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.waitingForResult = false;
      this.pause();
    }
  }

  setPageVisible(visible: boolean): void {
    this.pageVisible = visible;
    if (!visible) this.pause();
  }

  playSpin(): void {
    this.waitingForResult = true;
    if (!this.canPlay) return;
    this.stopEffects();
    this.unlock((context) => this.playEffect(context, SPIN_TONES));
  }

  playWin(): void {
    this.waitingForResult = false;
    // An async result never creates or resumes a context without a user gesture.
    if (this.canPlay && !this.suspension && this.context?.state === "running") {
      this.playEffect(this.context, WIN_TONES);
    }
  }

  finishSpin(): void {
    this.waitingForResult = false;
    this.pauseIfIdle();
  }

  private get canPlay(): boolean {
    return this.active && this.pageVisible && !document.hidden;
  }

  private unlock(onReady: (context: AudioContext) => void): void {
    if (!this.canPlay) return;

    let context: AudioContext;
    try {
      context = this.context ??= new AudioContext({ latencyHint: "interactive" });
    } catch {
      return;
    }

    const generation = this.generation;
    const requestedAt = performance.now();
    const ready = (): void => {
      if (!this.canPlay || generation !== this.generation || context.state !== "running") return;
      // Drop delayed feedback instead of replaying it after a later interaction.
      if (performance.now() - requestedAt <= MAX_START_DELAY_MS) onReady(context);
    };

    // Queue resume inside the gesture even if an earlier suspend is unfinished.
    if (context.state === "running" && !this.suspension) ready();
    else void context.resume().then(ready).catch(() => {});
  }

  private playEffect(context: AudioContext, tones: readonly Tone[]): void {
    this.stopEffects();
    try {
      const now = context.currentTime;
      for (const tone of tones) {
        const source = context.createOscillator();
        const envelope = context.createGain();
        const start = now + tone.offset;
        const end = start + tone.duration;
        this.voices.set(source, envelope);
        source.onended = () => {
          source.disconnect();
          envelope.disconnect();
          this.voices.delete(source);
          this.pauseIfIdle();
        };
        source.type = tone.wave;
        source.frequency.setValueAtTime(tone.frequency, start);
        if (tone.endFrequency !== undefined) {
          source.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
        }
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.004);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end - 0.008);
        envelope.gain.linearRampToValueAtTime(0, end);
        source.connect(envelope);
        envelope.connect(context.destination);
        source.start(start);
        source.stop(end);
      }
    } catch {
      // Optional audio must never interrupt a spin or win presentation.
      this.stopEffects();
    }
  }

  private stopEffects(): void {
    this.generation++;
    for (const [source, envelope] of this.voices) {
      try {
        source.stop();
      } catch {
        // A failed effect may contain a source that never started.
      }
      source.disconnect();
      envelope.disconnect();
      source.onended = null;
    }
    this.voices.clear();
  }

  private pause(): void {
    this.stopEffects();
    if (this.context && this.context.state !== "closed") {
      const suspension = this.context.suspend().catch(() => {});
      this.suspension = suspension;
      void suspension.then(() => {
        if (this.suspension === suspension) this.suspension = null;
      });
    }
  }

  private pauseIfIdle(): void {
    if (!this.waitingForResult && this.voices.size === 0) this.pause();
  }
}

import type { AnimationName, SymbolPreview } from "../types";

export const animationMixDurationSeconds = 0.16;
const fallbackAnimationDurationSeconds = 1;

type AnimationOptions = {
  animation: AnimationName;
  trackTime: number;
  mixDuration: number;
  loop?: boolean;
  previousAnimation?: AnimationName;
};

export function playPreviewAnimation(preview: SymbolPreview, options: AnimationOptions): void {
  const { spine } = preview;
  const animation = spine.skeleton.data.findAnimation(options.animation);

  if (!animation) {
    spine.state.clearTrack(0);
    spine.skeleton.setupPose();
    spine.update(0);
    return;
  }

  spine.state.data.defaultMix = animationMixDurationSeconds;

  const entry = spine.state.setAnimation(0, options.animation, options.loop ?? false);
  entry.mixDuration = options.mixDuration;
  entry.timeScale = 1;
  entry.trackTime = options.trackTime;
  entry.setAnimationLast(entry.trackTime);

  if (options.mixDuration > 0 && options.previousAnimation && options.previousAnimation !== options.animation) {
    spine.state.data.setMix(options.previousAnimation, options.animation, options.mixDuration);
  }
}

export function getPreviewAnimationDuration(
  preview: SymbolPreview | undefined,
  animationName: AnimationName
): number {
  const animation = preview?.spine.skeleton.data.findAnimation(animationName);
  return animation?.duration ?? fallbackAnimationDurationSeconds;
}

export function hasPreviewAnimation(preview: SymbolPreview, animationName: AnimationName): boolean {
  return preview.spine.skeleton.data.findAnimation(animationName) !== null;
}

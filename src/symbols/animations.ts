import type { AnimationName, SymbolDefinition } from "../types";

const variantCursor = new Map<string, number>();

export function firstAnimationVariant(symbol: SymbolDefinition, logicalAnimation: AnimationName): string {
  return getAnimationVariants(symbol, logicalAnimation)[0] ?? logicalAnimation;
}

export function nextAnimationVariant(symbol: SymbolDefinition, logicalAnimation: AnimationName): string {
  const variants = getAnimationVariants(symbol, logicalAnimation);
  if (variants.length === 0) return logicalAnimation;

  const key = `${symbol.id}:${logicalAnimation}`;
  const cursor = variantCursor.get(key) ?? 0;
  variantCursor.set(key, cursor + 1);
  return variants[cursor % variants.length];
}

export function randomAnimationVariant(symbol: SymbolDefinition, logicalAnimation: AnimationName): string {
  const variants = getAnimationVariants(symbol, logicalAnimation);
  if (variants.length === 0) return logicalAnimation;

  return variants[Math.floor(Math.random() * variants.length)];
}

export function stableSlotIdleAnimation(symbol: SymbolDefinition): string {
  return firstAnimationVariant(symbol, "Idle");
}

function getAnimationVariants(symbol: SymbolDefinition, logicalAnimation: AnimationName): readonly string[] {
  return symbol.animationVariants[logicalAnimation];
}

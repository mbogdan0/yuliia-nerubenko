export function requiredElement<TElement extends Element>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Demo markup is missing required element: ${selector}`);
  }
  return element;
}

/** Uniform random float in [min, max). */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Uniform random integer in [min, max], inclusive on both ends. */
export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

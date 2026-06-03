export const COMPACT_MAX_WIDTH = 1100;
export const COMPACT_MAX_HEIGHT = 820;

export function isCompactViewport(width: number, height: number): boolean {
  return width <= COMPACT_MAX_WIDTH || height <= COMPACT_MAX_HEIGHT;
}

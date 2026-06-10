export const GALLERY_DESKTOP_MIN_WIDTH = 900;

export function isGalleryDesktopViewport(width: number, height: number): boolean {
  // >= matches the CSS `orientation: landscape` query, which includes square viewports.
  return width >= GALLERY_DESKTOP_MIN_WIDTH && width >= height;
}

export function isGalleryCompactViewport(width: number, height: number): boolean {
  return !isGalleryDesktopViewport(width, height);
}

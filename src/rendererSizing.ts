import type { Application } from "pixi.js";

export function syncRendererToElement(app: Application, element: HTMLElement, resolution: number): void {
  const bounds = element.getBoundingClientRect();
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);

  if (width <= 0 || height <= 0) {
    return;
  }

  const pixelWidth = Math.round(width * resolution);
  const pixelHeight = Math.round(height * resolution);

  if (
    app.canvas.width !== pixelWidth ||
    app.canvas.height !== pixelHeight ||
    app.renderer.resolution !== resolution
  ) {
    app.renderer.resize(width, height, resolution);
  }
}

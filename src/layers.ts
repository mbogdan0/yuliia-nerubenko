import { Container } from "pixi.js";

export type AppLayers = {
  galleryLayer: Container;
  previewLayer: Container;
  slotLayer: Container;
  stageRoot: Container;
};

export function createAppLayers(): AppLayers {
  const stageRoot = new Container();

  const galleryLayer = new Container();
  const previewLayer = new Container();
  galleryLayer.addChild(previewLayer);

  const slotLayer = new Container();
  slotLayer.visible = false;

  stageRoot.addChild(galleryLayer, slotLayer);

  return {
    galleryLayer,
    previewLayer,
    slotLayer,
    stageRoot
  };
}

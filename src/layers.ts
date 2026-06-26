import { Container } from "pixi.js";

export type AppLayers = {
  galleryLayer: Container;
  popupLayer: Container;
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

  const popupLayer = new Container();

  stageRoot.addChild(galleryLayer, slotLayer, popupLayer);

  return {
    galleryLayer,
    popupLayer,
    previewLayer,
    slotLayer,
    stageRoot
  };
}

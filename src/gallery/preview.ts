import type { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Container } from "pixi.js";
import { firstAnimationVariant } from "../symbols/animations";
import { getCachedSymbolBounds } from "../symbols/bounds";
import { createManualSpine } from "../symbols/spine";
import type { SymbolDefinition, SymbolPreview, SymbolResolution } from "../types";

export function createSymbolPreview(symbol: SymbolDefinition, resolution: SymbolResolution): SymbolPreview {
  const host = new Container();
  const spine = createSymbolSpine(symbol, resolution);

  host.addChild(spine);
  host.label = symbol.label;
  host.alpha = 0;

  return { id: symbol.id, definition: symbol, host, spine, targetAlpha: 1 };
}

function createSymbolSpine(symbol: SymbolDefinition, resolution: SymbolResolution): Spine {
  const spine = createManualSpine(symbol, resolution);

  spine.label = symbol.label;

  // Warm the shared fit-bounds cache from a stable reference pose (logical Idle, frame 0)
  // so the gallery and the slot size every symbol from the same box, and so the
  // fit never changes from a transient animation frame when the window is resized.
  // GalleryTab.rebuildGallery applies the real preview animation right afterwards.
  spine.state.setAnimation(0, firstAnimationVariant(symbol, "Idle"), false);
  spine.update(0);
  getCachedSymbolBounds(symbol, spine);

  return spine;
}

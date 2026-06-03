import { Spine, type SpineOptions } from "@esotericsoftware/spine-pixi-v8";
import { getSpineAssetSource } from "./assets";
import type { SymbolDefinition, SymbolId } from "../types";

const spineOptionsCache = new Map<SymbolId, SpineOptions>();

export function createManualSpine(symbol: SymbolDefinition): Spine {
  return new Spine(getManualSpineOptions(symbol));
}

function getManualSpineOptions(symbol: SymbolDefinition): SpineOptions {
  const cachedOptions = spineOptionsCache.get(symbol.id);
  if (cachedOptions) {
    return cachedOptions;
  }

  const asset = getSpineAssetSource(symbol);

  const options = Spine.createOptions({
    skeleton: asset.skeletonAlias,
    atlas: asset.atlasAlias,
    autoUpdate: false,
    scale: 1
  });

  spineOptionsCache.set(symbol.id, options);
  return options;
}

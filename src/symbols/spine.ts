import { Spine, type SpineOptions } from "@esotericsoftware/spine-pixi-v8";
import { getAtlasSource } from "./assets";
import type { SymbolDefinition, SymbolResolution } from "../types";

// Keyed by `${id}:${resolution}` — the skeleton is shared but each resolution
// binds a different atlas, so options must not collide across resolutions.
const spineOptionsCache = new Map<string, SpineOptions>();

export function createManualSpine(symbol: SymbolDefinition, resolution: SymbolResolution): Spine {
  return new Spine(getManualSpineOptions(symbol, resolution));
}

function getManualSpineOptions(symbol: SymbolDefinition, resolution: SymbolResolution): SpineOptions {
  const cacheKey = `${symbol.id}:${resolution}`;
  const cachedOptions = spineOptionsCache.get(cacheKey);
  if (cachedOptions) {
    return cachedOptions;
  }

  const atlas = getAtlasSource(symbol, resolution);

  const options = Spine.createOptions({
    skeleton: symbol.asset.skeletonAlias,
    atlas: atlas.atlasAlias,
    autoUpdate: false,
    scale: 1
  });

  spineOptionsCache.set(cacheKey, options);
  return options;
}

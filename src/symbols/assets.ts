import { Assets } from "pixi.js";
import type { AtlasAssetSource, SpineAssetSource, SymbolDefinition, SymbolResolution } from "../types";

export function symbolAsset(symbolId: string): SpineAssetSource {
  const symbolPath = `${import.meta.env.BASE_URL}symbols/${symbolId}`;

  return {
    skeletonAlias: `${symbolId}Skeleton`,
    skeletonSrc: `${symbolPath}/skeleton.skel`,
    atlases: {
      high: atlasSource(symbolId, symbolPath, "high"),
      low: atlasSource(symbolId, symbolPath, "low")
    }
  };
}

function atlasSource(symbolId: string, symbolPath: string, resolution: SymbolResolution): AtlasAssetSource {
  return {
    atlasAlias: `${symbolId}Atlas:${resolution}`,
    atlasSrc: `${symbolPath}/${resolution}/atlas.atlas`
  };
}

export function getAtlasSource(symbol: SymbolDefinition, resolution: SymbolResolution): AtlasAssetSource {
  return symbol.asset.atlases[resolution];
}

export async function ensureSpineAssets(
  symbols: SymbolDefinition[],
  resolution: SymbolResolution
): Promise<void> {
  // One skeleton is shared by both resolutions; only the chosen atlas is loaded.
  // The atlas and skeleton are independent files (their only dependency is at
  // Spine construction time), so every unique asset loads in parallel.
  const queued = new Set<string>();
  const pending: Promise<unknown>[] = [];

  for (const symbol of symbols) {
    queueAsset(symbol.asset.skeletonAlias, symbol.asset.skeletonSrc, queued, pending);
    const atlas = symbol.asset.atlases[resolution];
    queueAsset(atlas.atlasAlias, atlas.atlasSrc, queued, pending);
  }

  await Promise.all(pending);
}

function queueAsset(alias: string, src: string, queued: Set<string>, pending: Promise<unknown>[]): void {
  if (queued.has(alias) || Assets.cache.has(alias)) {
    return;
  }
  queued.add(alias);
  Assets.add({ alias, src });
  pending.push(Assets.load(alias));
}

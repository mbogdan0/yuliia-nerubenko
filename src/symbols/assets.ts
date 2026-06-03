import { Assets } from "pixi.js";
import type { SpineAssetSource, SymbolDefinition } from "../types";

export function symbolAsset(symbolId: string): SpineAssetSource {
  const symbolPath = `${import.meta.env.BASE_URL}symbols/${symbolId}`;

  return {
    skeletonAlias: `${symbolId}Skeleton`,
    skeletonSrc: `${symbolPath}/skeleton.skel`,
    atlasAlias: `${symbolId}Atlas`,
    atlasSrc: `${symbolPath}/atlas.atlas`
  };
}

export function getSpineAssetSource(symbol: SymbolDefinition): SpineAssetSource {
  return symbol.asset;
}

export async function ensureSpineAssets(symbols: SymbolDefinition[]): Promise<void> {
  const assetSources = new Map<string, SpineAssetSource>();
  for (const symbol of symbols) {
    assetSources.set(symbol.asset.skeletonAlias, symbol.asset);
  }
  await Promise.all(Array.from(assetSources.values(), loadSpineAssetSource));
}

async function loadSpineAssetSource(asset: SpineAssetSource): Promise<void> {
  // The atlas and skeleton are independent files; their only dependency is at
  // Spine construction time (later). Load them in parallel rather than serially.
  const pending: Promise<unknown>[] = [];

  if (!Assets.cache.has(asset.atlasAlias)) {
    Assets.add({ alias: asset.atlasAlias, src: asset.atlasSrc });
    pending.push(Assets.load(asset.atlasAlias));
  }

  if (!Assets.cache.has(asset.skeletonAlias)) {
    Assets.add({ alias: asset.skeletonAlias, src: asset.skeletonSrc });
    pending.push(Assets.load(asset.skeletonAlias));
  }

  await Promise.all(pending);
}

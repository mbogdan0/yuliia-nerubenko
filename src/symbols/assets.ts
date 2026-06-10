import { Assets } from "pixi.js";
import type { AtlasAssetSource, SpineAssetSource, SymbolDefinition, SymbolResolution } from "../types";

export function symbolAsset(symbolId: string): SpineAssetSource {
  const symbolPath = `${import.meta.env.BASE_URL}symbols/${symbolId}`;

  return {
    skeletonAlias: `${symbolId}Skeleton`,
    skeletonSrc: `${symbolPath}/skeleton.skel?v=${__APP_VERSION__}`,
    atlases: {
      high: atlasSource(symbolId, symbolPath, "high"),
      low: atlasSource(symbolId, symbolPath, "low")
    }
  };
}

function atlasSource(symbolId: string, symbolPath: string, resolution: SymbolResolution): AtlasAssetSource {
  return {
    atlasAlias: `${symbolId}Atlas:${resolution}`,
    atlasSrc: `${symbolPath}/${resolution}/atlas.atlas?v=${__APP_VERSION__}`
  };
}

export function getAtlasSource(symbol: SymbolDefinition, resolution: SymbolResolution): AtlasAssetSource {
  return symbol.asset.atlases[resolution];
}

export async function ensureSpineAssets(
  symbols: SymbolDefinition[],
  resolution: SymbolResolution
): Promise<SymbolDefinition[]> {
  // One skeleton is shared by both resolutions; only the chosen atlas is loaded.
  // The atlas and skeleton are independent files (their only dependency is at
  // Spine construction time), so every unique asset loads in parallel.
  const queued = new Set<string>();
  const loads = symbols.map((symbol) => {
    const promises: Promise<unknown>[] = [];
    queueAsset(symbol.asset.skeletonAlias, symbol.asset.skeletonSrc, queued, promises);
    const atlas = symbol.asset.atlases[resolution];
    queueAsset(atlas.atlasAlias, atlas.atlasSrc, queued, promises);
    return { symbol, promises };
  });

  const outcomes = await Promise.all(
    loads.map(({ symbol, promises }) =>
      Promise.allSettled(promises).then((results) => {
        const failures = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected"
        );
        if (failures.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[assets] "${symbol.id}" failed to load, skipping:`,
            failures.map((f) => f.reason)
          );
          return null;
        }
        return symbol;
      })
    )
  );

  return outcomes.filter((s): s is SymbolDefinition => s !== null);
}

const loadingAssets = new Map<string, Promise<unknown>>();

function queueAsset(alias: string, src: string, queued: Set<string>, pending: Promise<unknown>[]): void {
  if (queued.has(alias) || Assets.cache.has(alias) || loadingAssets.has(alias)) {
    return;
  }
  queued.add(alias);
  Assets.add({ alias, src });
  const p = Assets.load(alias).finally(() => loadingAssets.delete(alias));
  loadingAssets.set(alias, p);
  pending.push(p);
}

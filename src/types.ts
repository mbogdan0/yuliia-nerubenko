import type { Container } from "pixi.js";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";

export type AnimationName = "Idle" | "Win";
export type GalleryMode = "focus" | "all";
export type SymbolId = string;
// Two texture resolutions ship per symbol: "high" (full ~300px, Gallery) and
// "low" (scale:0.7 ~210px, Slot demo). Both share one skeleton and render at the
// same logical size — "low" is just lighter texture data.
export type SymbolResolution = "high" | "low";

export type AtlasAssetSource = {
  atlasAlias: string;
  atlasSrc: string;
};

export type SpineAssetSource = {
  skeletonAlias: string;
  skeletonSrc: string;
  atlases: Record<SymbolResolution, AtlasAssetSource>;
};

export type SymbolDefinition = {
  id: SymbolId;
  label: string;
  emoji: string;
  fitSlots: string[];
  fitSlotsSet: ReadonlySet<string>;
  asset: SpineAssetSource;
};

export type SymbolPreview = {
  id: SymbolId;
  definition: SymbolDefinition;
  host: Container;
  spine: Spine;
  targetAlpha: number;
};

export type StageArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

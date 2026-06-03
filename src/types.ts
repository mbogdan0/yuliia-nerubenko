import type { Container } from "pixi.js";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";

export type AnimationName = "Idle" | "Win";
export type GalleryMode = "focus" | "all";
export type SymbolId = string;

export type SpineAssetSource = {
  skeletonAlias: string;
  skeletonSrc: string;
  atlasAlias: string;
  atlasSrc: string;
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

import { TextureAtlas } from "@esotericsoftware/spine-pixi-v8";
import { Assets, type Texture } from "pixi.js";

const POPUP_ASSET_BASE = `${import.meta.env.BASE_URL}popups/joker`;
export const POPUP_SKELETON_ALIAS = "jokerPopupSkeleton";
export const POPUP_ATLAS_ALIAS = "jokerPopupAtlas";

let loading: { controller: AbortController; promise: Promise<void> } | null = null;

export function cancelPopupAssetLoad(): void {
  loading?.controller.abort();
}

export function preloadJokerPopupAssets(): Promise<void> {
  if (loading) return loading.promise;
  if (Assets.cache.has(POPUP_SKELETON_ALIAS) && Assets.cache.has(POPUP_ATLAS_ALIAS)) return Promise.resolve();

  const controller = new AbortController();
  const promise = loadPopupAssets(controller.signal).catch((error: unknown) => {
    controller.abort();
    throw error;
  }).finally(() => {
    loading = null;
  });
  loading = { controller, promise };
  return promise;
}

async function fetchPopupFile(file: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(`${POPUP_ASSET_BASE}/${file}?v=${__APP_VERSION__}`, { signal, priority: "low" });
  if (!response.ok) throw new Error(`Joker popup asset failed to load: ${file} (${response.status}).`);
  return response;
}

async function loadPopupAssets(signal: AbortSignal): Promise<void> {
  const objectUrls: string[] = [];
  const imageUrls: string[] = [];
  let complete = false;
  const objectUrl = (blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    return url;
  };

  try {
    const [skeleton, atlasText] = await Promise.all([
      fetchPopupFile("skeleton.skel", signal).then((response) => response.blob()),
      fetchPopupFile("atlas.atlas", signal).then((response) => response.text())
    ]);
    const pages = new TextureAtlas(atlasText).pages;
    const images = await Promise.all(pages.map((page) =>
      fetchPopupFile(page.name, signal).then((response) => response.blob())
    ));
    signal.throwIfAborted();

    // Only the network stage is custom. Pixi still decodes each texture and
    // Spine still parses its atlas and skeleton with their original alpha data.
    const textures: Record<string, Texture["source"]> = {};
    for (let i = 0; i < pages.length; i++) {
      const src = objectUrl(images[i]);
      imageUrls.push(src);
      const texture = await Assets.load<Texture>({
        src,
        parser: "texture",
        data: { alphaMode: pages[i].pma ? "premultiplied-alpha" : "premultiply-alpha-on-upload" }
      });
      textures[pages[i].name] = texture.source;
    }

    Assets.add({ alias: POPUP_SKELETON_ALIAS, src: objectUrl(skeleton), parser: "spineSkeletonLoader" });
    Assets.add({
      alias: POPUP_ATLAS_ALIAS,
      src: objectUrl(new Blob([atlasText], { type: "text/plain" })),
      parser: "spineTextureAtlasLoader",
      data: { images: textures }
    });
    await Promise.all([Assets.load(POPUP_SKELETON_ALIAS), Assets.load(POPUP_ATLAS_ALIAS)]);
    complete = true;
  } finally {
    try {
      if (!complete && imageUrls.length > 0) await Assets.unload(imageUrls);
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }
}

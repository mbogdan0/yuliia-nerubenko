import type { GalleryRouteState } from "./gallery/GalleryTab";
import { getDefaultSymbol, symbolsById } from "./symbols/definitions";
import type { SymbolId } from "./types";

export type AppTab = "gallery" | "slot-demo";

export type RouteState =
  | {
      tab: "gallery";
      gallery: GalleryRouteState;
    }
  | {
      tab: "slot-demo";
    };

export function parseRouteHash(hash: string): RouteState {
  const defaultSymbol = getDefaultSymbol().id;
  const parts = parseHashParts(hash);

  if (parts[0] === "slot-demo") {
    return { tab: "slot-demo" };
  }

  if (parts[0] === "gallery" && parts[1] === "all") {
    return createGalleryRoute("all", defaultSymbol);
  }

  if (parts[0] === "gallery" && parts[1] === "single") {
    const hashSymbolId = parts[2] as SymbolId | undefined;
    return createGalleryRoute(
      "focus",
      hashSymbolId && symbolsById.has(hashSymbolId) ? hashSymbolId : defaultSymbol
    );
  }

  return createDefaultGalleryRoute(defaultSymbol);
}

export function buildRouteHash(route: RouteState): string {
  if (route.tab === "slot-demo") {
    return "#/slot-demo";
  }

  if (route.gallery.mode === "all") {
    return "#/gallery/all";
  }

  return `#/gallery/single/${route.gallery.selectedSymbolId}`;
}

function createDefaultGalleryRoute(defaultSymbol: SymbolId): RouteState {
  return createGalleryRoute("all", defaultSymbol);
}

function createGalleryRoute(mode: GalleryRouteState["mode"], selectedSymbolId: SymbolId): RouteState {
  return {
    tab: "gallery",
    gallery: {
      mode,
      selectedSymbolId
    }
  };
}

function parseHashParts(hash: string): string[] {
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

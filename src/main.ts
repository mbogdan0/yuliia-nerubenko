import { Application, Assets, UPDATE_PRIORITY, type Ticker } from "pixi.js";
import { getAppDomRefs } from "./dom";
import type { GalleryTab, GalleryRouteState } from "./gallery/GalleryTab";
import { createAppLayers } from "./layers";
import { completeLoading, setStageLoading, showLoadingError, showStageLoadingError } from "./loadingScreen";
import { reportError } from "./reportError";
import { buildRouteHash, parseRouteHash, type AppTab, type RouteState } from "./router";
import type { SlotTab } from "./slot/SlotTab";
import { ensureSpineAssets } from "./symbols/assets";
import { getDefaultSymbol, symbolDefinitions, symbolsById } from "./symbols/definitions";
import { applyActiveTab, bindTabButtons } from "./tabs";
import "./style.css";

const dom = getAppDomRefs();
const app = new Application();
const layers = createAppLayers();

let requestedRoute = parseRouteHash(window.location.hash);
let activeTab: AppTab = requestedRoute.tab;
let isApplyingRoute = false;
let routeGeneration = 0;
let viewReady = false;
let hasRenderedView = false;
let resizeFrame: number | null = null;
let galleryInitialization: Promise<GalleryTab> | null = null;
let slotInitialization: Promise<SlotTab> | null = null;
let galleryReady = false;
let slotReady = false;
let gallery: GalleryTab | null = null;
let slotDemo: SlotTab | null = null;
let galleryRoute: GalleryRouteState = requestedRoute.tab === "gallery"
  ? requestedRoute.gallery
  : { mode: "all", selectedSymbolId: getDefaultSymbol().id };

function setRouteHash(route: RouteState): void {
  const nextHash = buildRouteHash(route);
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
}

async function ensureGalleryReady(state: GalleryRouteState): Promise<GalleryTab> {
  galleryInitialization ??= import("./gallery/GalleryTab").then(async ({ GalleryTab }) => {
    const instance = gallery ??= new GalleryTab(app, layers.previewLayer, dom.galleryElements, (nextState) => {
      galleryRoute = nextState;
      if (!isApplyingRoute && activeTab === "gallery") {
        requestedRoute = { tab: "gallery", gallery: nextState };
        setRouteHash(requestedRoute);
      }
    });
    await instance.init(state);
    galleryReady = true;
    return instance;
  }).catch((error: unknown) => {
    galleryInitialization = null;
    throw error;
  });
  return galleryInitialization;
}

async function ensureSlotReady(): Promise<SlotTab> {
  slotInitialization ??= Promise.all([
    import("./slot/SlotTab"),
    import("./slot/JokerPopup")
  ]).then(async ([{ SlotTab }, { JokerPopup }]) => {
    const instance = slotDemo ??= new SlotTab(app, layers.slotLayer, dom.slotButtons, {
      gameRoot: dom.gameRoot,
      stageShell: dom.stageShell
    }, new JokerPopup(app, layers.popupLayer, dom.appRoot));
    await instance.init();
    slotReady = true;
    return instance;
  }).catch((error: unknown) => {
    slotInitialization = null;
    throw error;
  });
  return slotInitialization;
}

async function showRoute(route: RouteState, updateHash = false): Promise<void> {
  if ((viewReady || isApplyingRoute) && buildRouteHash(route) === buildRouteHash(requestedRoute)) {
    if (updateHash) setRouteHash(route);
    return;
  }

  const generation = ++routeGeneration;
  const tabChanged = route.tab !== activeTab;
  requestedRoute = route;
  activeTab = route.tab;
  isApplyingRoute = true;
  viewReady = false;
  dom.galleryPanel.inert = true;
  dom.gameRoot.setAttribute("aria-label", route.tab === "gallery" ? "Animated symbol gallery" : "Animated slot demo");
  slotDemo?.setActive(false);
  setStageLoading(dom.gameRoot, true);

  if (route.tab === "gallery") galleryRoute = route.gallery;
  if (updateHash) setRouteHash(route);

  applyActiveTab(route.tab, {
    dom,
    layers,
    onGalleryResize: () => { if (galleryReady) gallery?.onResize(); },
    onSlotResize: () => { if (slotReady) slotDemo?.onResize(); }
  });
  if (tabChanged) window.scrollTo({ top: 0, left: 0, behavior: "instant" });

  try {
    if (route.tab === "gallery") {
      const readyGallery = await ensureGalleryReady(route.gallery);
      if (generation !== routeGeneration) return;
      await readyGallery.applyRouteState(route.gallery);
    } else {
      await ensureSlotReady();
    }
    if (generation !== routeGeneration) return;

    slotDemo?.setActive(route.tab === "slot-demo");
    viewReady = true;
    resizeActiveTab();

    // Resize callbacks run first, then present a real animation frame before
    // removing the loader. Previews start transparent until their first update.
    await new Promise<void>((resolve, reject) => {
      window.requestAnimationFrame(() => {
        try {
          if (generation === routeGeneration) {
            tickActiveTab(app.ticker);
            app.render();
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    if (generation !== routeGeneration) return;

    setStageLoading(dom.gameRoot, false);
    dom.galleryPanel.inert = route.tab !== "gallery";
    if (!hasRenderedView) {
      hasRenderedView = true;
      completeLoading(dom.loadingScreen);
      performance.mark("app-ready");
      performance.measure("app-startup", { start: 0, end: "app-ready" });
    }
    if (route.tab === "slot-demo") slotDemo?.onPresented();
  } catch (error) {
    reportError(error);
    if (generation !== routeGeneration) return;

    viewReady = false;
    setStageLoading(dom.gameRoot, false);
    if (hasRenderedView) {
      showStageLoadingError(dom.gameRoot, () => { void showRoute(requestedRoute); });
    } else {
      showLoadingError(dom.loadingScreen);
    }
  } finally {
    if (generation === routeGeneration) isApplyingRoute = false;
  }
}

function tickActiveTab(ticker: Ticker): void {
  if (activeTab === "gallery" && galleryReady && viewReady) gallery?.tick(ticker);
  // A hidden spin must finish its own timers and release its controls. Its layer
  // is invisible, so this adds no rendering work to the gallery.
  if (slotReady && ((activeTab === "slot-demo" && viewReady) || slotDemo?.needsTick)) slotDemo?.tick(ticker);
}

function resizeActiveTab(): void {
  if (activeTab === "gallery" && galleryReady) gallery?.onResize();
  else if (activeTab === "slot-demo" && slotReady) slotDemo?.onResize();
}

function scheduleActiveTabResize(): void {
  if (resizeFrame !== null) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    resizeActiveTab();
  });
}

function syncPageVisibility(): void {
  slotDemo?.onVisibilityChange();
  if (document.hidden) {
    app.ticker.stop();
  } else {
    app.ticker.start();
    scheduleActiveTabResize();
  }
}

async function bootstrap(): Promise<void> {
  // Spine registers its rendering pipe when the requested tab module loads.
  // Register it before Pixi initializes the renderer's pipes.
  const initialRoute = parseRouteHash(window.location.hash);
  await Promise.all([
    initialRoute.tab === "gallery" ? import("./gallery/GalleryTab") : import("./slot/SlotTab"),
    // Every URL names its format explicitly; no AVIF, WebP or video probing is
    // needed before loading the PNG atlases and binary skeletons.
    Assets.init({ skipDetections: true })
  ]);
  // Fetch the requested textures while Pixi loads and initializes its backend.
  // Tab initialization joins these promises before constructing any Spines.
  const assetRoute = parseRouteHash(window.location.hash);
  const initialSymbols = assetRoute.tab === "gallery" && assetRoute.gallery.mode === "focus"
    ? [symbolsById.get(assetRoute.gallery.selectedSymbolId) ?? getDefaultSymbol()]
    : symbolDefinitions;
  void ensureSpineAssets(initialSymbols, assetRoute.tab === "slot-demo" ? "low" : "high").catch(reportError);
  await app.init({
    // Supersampling is set by each view; MSAA would add redundant fill cost.
    antialias: false,
    autoDensity: true,
    backgroundAlpha: 0,
    resolution: 1
  });

  // Time-based updates preserve motion at a steady 60fps on high-refresh screens.
  app.ticker.maxFPS = 60;
  dom.gameRoot.appendChild(app.canvas);
  app.stage.addChild(layers.stageRoot);
  app.stage.eventMode = "none";
  app.ticker.add(tickActiveTab, undefined, UPDATE_PRIORITY.NORMAL);

  bindTabButtons(dom.tabButtons, (tab) => {
    void showRoute(tab === "gallery" ? { tab, gallery: galleryRoute } : { tab }, true);
  });

  window.addEventListener("hashchange", () => { void showRoute(parseRouteHash(window.location.hash)); });
  window.addEventListener("resize", scheduleActiveTabResize);
  window.visualViewport?.addEventListener("resize", scheduleActiveTabResize);
  document.addEventListener("visibilitychange", syncPageVisibility);
  syncPageVisibility();

  await showRoute(parseRouteHash(window.location.hash));
}

bootstrap().catch((error) => {
  reportError(error);
  showLoadingError(dom.loadingScreen);
});

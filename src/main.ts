import { Application, type Ticker } from "pixi.js";
import { getAppDomRefs } from "./dom";
import { GalleryTab } from "./gallery/GalleryTab";
import { createAppLayers } from "./layers";
import { completeLoading, showLoadingError } from "./loadingScreen";
import { reportError } from "./reportError";
import { buildRouteHash, parseRouteHash, type AppTab, type RouteState } from "./router";
import { JokerPopup } from "./slot/JokerPopup";
import { SlotTab } from "./slot/SlotTab";
import { applyActiveTab, bindTabButtons } from "./tabs";
import "./style.css";

const dom = getAppDomRefs();

const app = new Application();
const layers = createAppLayers();

let activeTab: AppTab = "gallery";
let isApplyingHash = false;
let resizeFrame: number | null = null;

const gallery = new GalleryTab(app, layers.previewLayer, dom.galleryElements, (state) => {
  if (!isApplyingHash && activeTab === "gallery") {
    setRouteHash({ tab: "gallery", gallery: state });
  }
});

const jokerPopup = new JokerPopup(app, layers.popupLayer, dom.appRoot);
const slotDemo = new SlotTab(app, layers.slotLayer, dom.slotButtons, {
  gameRoot: dom.gameRoot,
  stageShell: dom.stageShell
}, jokerPopup);

function switchTab(tabId: AppTab, updateHash = true): void {
  activeTab = tabId;
  slotDemo.setActive(tabId === "slot-demo");

  applyActiveTab(tabId, {
    dom,
    layers,
    onGalleryResize: () => gallery.onResize(),
    onSlotResize: () => slotDemo.onResize()
  });

  if (updateHash && !isApplyingHash) {
    setRouteHash(tabId === "gallery" ? { tab: "gallery", gallery: gallery.getRouteState() } : { tab: "slot-demo" });
  }
}

bindTabButtons(dom.tabButtons, switchTab);

function setRouteHash(route: RouteState): void {
  const nextHash = buildRouteHash(route);
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function tickActiveTab(ticker: Ticker): void {
  if (activeTab === "gallery") gallery.tick(ticker);
  else slotDemo.tick(ticker);
}

function resizeActiveTab(): void {
  if (activeTab === "gallery") gallery.onResize();
  else slotDemo.onResize();
}

function scheduleActiveTabResize(): void {
  if (resizeFrame !== null) {
    return;
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    resizeActiveTab();
  });
}

async function applyRouteFromHash(): Promise<void> {
  isApplyingHash = true;
  const route = parseRouteHash(window.location.hash);

  try {
    if (route.tab === "slot-demo") {
      switchTab("slot-demo", false);
      return;
    }

    switchTab("gallery", false);
    await gallery.applyRouteState(route.gallery);
  } finally {
    isApplyingHash = false;
  }
}

async function bootstrap(): Promise<void> {
  await app.init({
    // The resolution:2 backing store already supersamples edges, so MSAA is
    // redundant fill-rate cost — the main driver of slot stutter on large
    // high-DPR tablets. Disable it and keep resolution for crispness.
    antialias: false,
    autoDensity: true,
    backgroundAlpha: 0,
    resolution: 1
  });

  // Steady 60fps cadence: ProMotion (120Hz) doubles per-second render work which
  // the slot can't sustain on tablets. Motion stays correct — updates are
  // time-based (ticker.deltaMS), not per-frame.
  app.ticker.maxFPS = 60;

  dom.gameRoot.appendChild(app.canvas);
  app.stage.addChild(layers.stageRoot);

  // All controls are DOM buttons; nothing on the canvas is interactive. Disable
  // hit testing for the whole scene graph so Pixi's event system doesn't traverse
  // every symbol Spine on each pointer move over the canvas.
  app.stage.eventMode = "none";

  await gallery.init();
  await slotDemo.init();
  await applyRouteFromHash();
  completeLoading(dom.loadingScreen);

  app.ticker.add((ticker) => {
    tickActiveTab(ticker);
  });

  // iOS animates the address bar without always firing window 'resize'; the visual
  // viewport does. Debounce both resize sources into the active tab's manual sizing.
  window.addEventListener("resize", scheduleActiveTabResize);
  window.visualViewport?.addEventListener("resize", scheduleActiveTabResize);

  window.addEventListener("hashchange", () => {
    applyRouteFromHash().catch(reportError);
  });
}

bootstrap().catch((error) => {
  reportError(error);
  showLoadingError(dom.loadingScreen);
});

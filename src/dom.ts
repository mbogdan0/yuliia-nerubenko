import type { GalleryDomElements } from "./gallery/controls";
import { requiredElement } from "./utils";

export type SlotButtonElements = {
  spinButton: HTMLButtonElement;
  spinWinButton: HTMLButtonElement;
};

export type AppDomRefs = {
  appRoot: HTMLElement;
  gameRoot: HTMLDivElement;
  galleryPanel: HTMLElement;
  galleryElements: GalleryDomElements;
  loadingScreen: HTMLElement;
  mobileNotice: HTMLElement;
  mobileNoticeClose: HTMLButtonElement;
  slotButtons: SlotButtonElements;
  slotControls: HTMLElement;
  slotDemoUi: HTMLElement;
  tabNav: HTMLElement;
  tabButtons: HTMLButtonElement[];
};

export function getAppDomRefs(): AppDomRefs {
  const appRoot = requiredElement<HTMLElement>("#app");
  const gameRoot = requiredElement<HTMLDivElement>("#game-root");
  const galleryPanel = requiredElement<HTMLElement>("#gallery-panel");

  return {
    appRoot,
    gameRoot,
    galleryPanel,
    galleryElements: {
      gameRoot,
      settingsPanel: galleryPanel,
      modeButtons: getButtons("[data-mode]"),
      animationButtons: getButtons("[data-animation]"),
      symbolButtonsContainer: requiredElement<HTMLElement>("#symbol-buttons")
    },
    loadingScreen: requiredElement<HTMLElement>("#loading-screen"),
    mobileNotice: requiredElement<HTMLElement>("#mobile-notice"),
    mobileNoticeClose: requiredElement<HTMLButtonElement>(".mobile-notice-close"),
    slotButtons: {
      spinButton: requiredElement<HTMLButtonElement>("#spin-button"),
      spinWinButton: requiredElement<HTMLButtonElement>("#spin-win-button")
    },
    slotControls: requiredElement<HTMLElement>("#slot-controls"),
    slotDemoUi: requiredElement<HTMLElement>(".slot-demo-ui"),
    tabNav: requiredElement<HTMLElement>(".tab-nav"),
    tabButtons: getButtons("[data-tab]")
  };
}

function getButtons(selector: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
}

import type { AppDomRefs } from "./dom";
import type { AppLayers } from "./layers";
import type { AppTab } from "./router";

type TabViewOptions = {
  dom: Pick<AppDomRefs, "appRoot" | "galleryPanel" | "slotControls" | "tabButtons">;
  layers: Pick<AppLayers, "galleryLayer" | "slotLayer">;
  onGalleryResize: () => void;
  onSlotResize: () => void;
};

export function applyActiveTab(tabId: AppTab, options: TabViewOptions): void {
  for (const btn of options.dom.tabButtons) {
    btn.classList.toggle("is-active", btn.dataset.tab === tabId);
  }

  options.dom.galleryPanel.classList.toggle("is-hidden", tabId !== "gallery");
  options.dom.slotControls.classList.toggle("is-hidden", tabId !== "slot-demo");
  options.dom.appRoot.classList.toggle("is-slot-active", tabId === "slot-demo");
  options.layers.galleryLayer.visible = tabId === "gallery";
  options.layers.slotLayer.visible = tabId === "slot-demo";

  if (tabId === "gallery") options.onGalleryResize();
  if (tabId === "slot-demo") options.onSlotResize();
}

export function bindTabButtons(tabButtons: HTMLButtonElement[], onTabChange: (tabId: AppTab) => void): void {
  for (const btn of tabButtons) {
    btn.addEventListener("click", () => {
      onTabChange(getTabFromButton(btn));
    });
  }
}

function getTabFromButton(button: HTMLButtonElement): AppTab {
  return button.dataset.tab === "slot-demo" ? "slot-demo" : "gallery";
}

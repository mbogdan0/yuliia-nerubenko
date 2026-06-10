import type { AnimationName, GalleryMode, SymbolDefinition, SymbolId } from "../types";
import { reportError } from "../reportError";
import { symbolsById } from "../symbols/definitions";

export type GalleryControlCallbacks = {
  onModeChange: (mode: GalleryMode) => Promise<void>;
  onAnimationChange: (anim: AnimationName) => void;
  onSymbolChange: (id: SymbolId) => Promise<void>;
};

export type GalleryControlState = {
  mode: GalleryMode;
  animation: AnimationName;
  selectedSymbolId: SymbolId;
};

export type GalleryDomElements = {
  gameRoot: HTMLElement;
  animationButtons: HTMLButtonElement[];
  symbolButtonsContainer: HTMLElement;
};

export function renderSymbolButtons(elements: GalleryDomElements, symbols: SymbolDefinition[]): void {
  const allButton = document.createElement("button");
  allButton.className = "control-button symbol-button symbol-button--all";
  allButton.type = "button";
  allButton.dataset.mode = "all";
  allButton.textContent = "All Symbols";

  elements.symbolButtonsContainer.replaceChildren(
    allButton,
    ...symbols.map((symbol) => {
      const button = document.createElement("button");
      button.className = "control-button symbol-button";
      button.type = "button";
      button.dataset.symbol = symbol.id;
      button.textContent = `${symbol.emoji} ${symbol.label}`;
      return button;
    })
  );
}

export function bindControls(
  elements: GalleryDomElements,
  callbacks: GalleryControlCallbacks
): void {
  const allButton = elements.symbolButtonsContainer.querySelector<HTMLButtonElement>("[data-mode='all']");
  allButton?.addEventListener("click", () => {
    callbacks.onModeChange("all").catch(reportError);
  });

  for (const button of elements.animationButtons) {
    button.addEventListener("click", () => {
      const anim = getAnimationFromButton(button);
      callbacks.onAnimationChange(anim);
    });
  }

  for (const button of getSymbolButtons(elements)) {
    button.addEventListener("click", () => {
      const symbolId = getSymbolFromButton(button);
      if (symbolId === null) return;
      callbacks.onSymbolChange(symbolId).catch(reportError);
    });
  }
}

export function updateControls(elements: GalleryDomElements, state: GalleryControlState): void {
  const allButton = elements.symbolButtonsContainer.querySelector<HTMLButtonElement>("[data-mode='all']");
  allButton?.classList.toggle("is-active", state.mode === "all");

  for (const button of elements.animationButtons) {
    button.classList.toggle("is-active", button.dataset.animation === state.animation);
  }

  for (const button of getSymbolButtons(elements)) {
    button.classList.toggle("is-active", state.mode === "focus" && button.dataset.symbol === state.selectedSymbolId);
  }
}

function getSymbolButtons(elements: GalleryDomElements): HTMLButtonElement[] {
  return Array.from(elements.symbolButtonsContainer.querySelectorAll<HTMLButtonElement>("[data-symbol]"));
}

function getAnimationFromButton(button: HTMLButtonElement): AnimationName {
  return button.dataset.animation === "Idle" ? "Idle" : "Win";
}

function getSymbolFromButton(button: HTMLButtonElement): SymbolId | null {
  const symbolId = button.dataset.symbol as SymbolId;
  return symbolsById.has(symbolId) ? symbolId : null;
}

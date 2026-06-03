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
  settingsPanel: HTMLElement;
  modeButtons: HTMLButtonElement[];
  animationButtons: HTMLButtonElement[];
  symbolButtonsContainer: HTMLElement;
};

export function renderSymbolButtons(elements: GalleryDomElements, symbols: SymbolDefinition[]): void {
  elements.symbolButtonsContainer.replaceChildren(
    ...symbols.map((symbol, index) => {
      const button = document.createElement("button");
      button.className = `control-button symbol-button${index === 0 ? " is-active" : ""}`;
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
  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => {
      callbacks.onModeChange(getModeFromButton(button)).catch(reportError);
    });
  }

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
  for (const button of elements.modeButtons) {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  }

  for (const button of elements.animationButtons) {
    button.classList.toggle("is-active", button.dataset.animation === state.animation);
  }

  for (const button of getSymbolButtons(elements)) {
    button.classList.toggle("is-active", button.dataset.symbol === state.selectedSymbolId);
    button.disabled = state.mode === "all";
  }
}

function getSymbolButtons(elements: GalleryDomElements): HTMLButtonElement[] {
  return Array.from(elements.symbolButtonsContainer.querySelectorAll<HTMLButtonElement>("[data-symbol]"));
}

function getModeFromButton(button: HTMLButtonElement): GalleryMode {
  return button.dataset.mode === "all" ? "all" : "focus";
}

function getAnimationFromButton(button: HTMLButtonElement): AnimationName {
  return button.dataset.animation === "Idle" ? "Idle" : "Win";
}

function getSymbolFromButton(button: HTMLButtonElement): SymbolId | null {
  const symbolId = button.dataset.symbol as SymbolId;
  return symbolsById.has(symbolId) ? symbolId : null;
}

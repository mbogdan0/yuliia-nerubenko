const LOADED_CLASS = "is-loaded";
const ERROR_CLASS = "is-error";
const STAGE_ERROR_CLASS = "stage-load-error";
const STAGE_LOADING_CLASS = "stage-loading-status";

function createLoadingStatus(): HTMLElement {
  const status = document.createElement("div");
  status.className = STAGE_LOADING_CLASS;
  status.setAttribute("role", "status");
  status.setAttribute("aria-label", "Loading animations");
  const indicator = document.createElement("div");
  indicator.className = "loading-indicator";
  indicator.setAttribute("aria-hidden", "true");
  indicator.append(...Array.from({ length: 3 }, () => document.createElement("span")));
  const hint = document.createElement("p");
  hint.className = "loading-hint";
  hint.textContent = "One little moment";
  status.append(indicator, hint);
  return status;
}

export function setStageLoading(gameRoot: HTMLElement, loading: boolean): void {
  gameRoot.querySelector(`.${STAGE_ERROR_CLASS}`)?.remove();
  if (loading && !gameRoot.querySelector(`.${STAGE_LOADING_CLASS}`)) {
    gameRoot.appendChild(createLoadingStatus());
  }
  gameRoot.setAttribute("aria-busy", String(loading));
}

export function showStageLoadingError(gameRoot: HTMLElement, retry: () => void): void {
  setStageLoading(gameRoot, false);

  const status = document.createElement("div");
  status.className = STAGE_ERROR_CLASS;
  status.setAttribute("role", "alert");

  const message = document.createElement("span");
  message.textContent = "Unable to load this view.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Retry";
  button.addEventListener("click", retry);
  status.append(message, button);
  gameRoot.appendChild(status);
}

export function completeLoading(loadingScreen: HTMLElement): void {
  loadingScreen.classList.add(LOADED_CLASS);
  loadingScreen.setAttribute("aria-hidden", "true");
}

export function showLoadingError(loadingScreen: HTMLElement): void {
  loadingScreen.classList.add(ERROR_CLASS);
  loadingScreen.classList.remove(LOADED_CLASS);
  loadingScreen.setAttribute("aria-hidden", "false");
  loadingScreen.setAttribute("role", "alert");

  const heading = document.createElement("strong");
  heading.textContent = "Unable to start the application.";
  const hint = document.createElement("span");
  hint.textContent = "Let's give it another try.";
  const button = document.createElement("button");
  button.className = "loading-retry";
  button.type = "button";
  button.textContent = "Reload";
  button.addEventListener("click", () => { window.location.reload(); });
  loadingScreen.replaceChildren(heading, hint, button);
}

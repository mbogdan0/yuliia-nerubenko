const LOADED_CLASS = "is-loaded";
const ERROR_CLASS = "is-error";
const STAGE_ERROR_CLASS = "stage-load-error";

export function setStageLoading(gameRoot: HTMLElement, loading: boolean): void {
  gameRoot.querySelector(`.${STAGE_ERROR_CLASS}`)?.remove();
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
  loadingScreen.setAttribute("role", "alert");

  const heading = document.createElement("strong");
  heading.textContent = "Unable to start the application.";
  const hint = document.createElement("span");
  hint.textContent = "Please refresh the page or try again later.";
  loadingScreen.replaceChildren(heading, hint);
}

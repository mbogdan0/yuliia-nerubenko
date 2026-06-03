const LOADED_CLASS = "is-loaded";
const ERROR_CLASS = "is-error";

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

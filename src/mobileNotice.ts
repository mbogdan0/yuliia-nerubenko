const DISMISSED_STORAGE_KEY = "mobileNoticeDismissed";
const DISMISSED_CLASS = "is-dismissed";

export function bindMobileNotice(notice: HTMLElement, closeButton: HTMLButtonElement): void {
  if (sessionStorage.getItem(DISMISSED_STORAGE_KEY) === "true") {
    notice.classList.add(DISMISSED_CLASS);
  }

  closeButton.addEventListener("click", () => {
    sessionStorage.setItem(DISMISSED_STORAGE_KEY, "true");
    notice.classList.add(DISMISSED_CLASS);
  });
}

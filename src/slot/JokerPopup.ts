import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Assets, Container, Graphics, type Application } from "pixi.js";
import { animationMixDurationSeconds } from "../gallery/playback";

const POPUP_ASSET_BASE = `${import.meta.env.BASE_URL}popups/joker`;
const POPUP_SKELETON_ALIAS = "jokerPopupSkeleton";
const POPUP_ATLAS_ALIAS = "jokerPopupAtlas";
const POPUP_AUTO_CLOSE_SECONDS = 10;
const POPUP_IDLE_DELAY_SECONDS = 0.25;
const POPUP_MAX_SCREEN_FILL = 0.96;

type PopupState = "hidden" | "intro" | "idle" | "outro";
type PopupBounds = { x: number; y: number; width: number; height: number };

let popupAssetsPromise: Promise<void> | null = null;

export function preloadJokerPopupAssets(): Promise<void> {
  if (popupAssetsPromise) return popupAssetsPromise;

  Assets.add({
    alias: POPUP_SKELETON_ALIAS,
    src: `${POPUP_ASSET_BASE}/skeleton.skel?v=${__APP_VERSION__}`
  });
  Assets.add({
    alias: POPUP_ATLAS_ALIAS,
    src: `${POPUP_ASSET_BASE}/atlas.atlas?v=${__APP_VERSION__}`
  });

  popupAssetsPromise = Promise.all([
    Assets.load(POPUP_SKELETON_ALIAS),
    Assets.load(POPUP_ATLAS_ALIAS)
  ]).then(() => undefined);

  return popupAssetsPromise;
}

export class JokerPopup {
  private readonly overlay = new Container();
  private readonly backdrop = new Graphics();
  private readonly domOverlay: HTMLDivElement;
  private spine: Spine | null = null;
  private popupBounds: PopupBounds | null = null;
  // Bounds depend only on the (static) skeleton data, so sample them once and
  // reuse across every show instead of recomputing on each pop-in.
  private cachedPopupBounds: PopupBounds | null = null;
  private state: PopupState = "hidden";
  private stateElapsed = 0;
  private autoCloseElapsed = 0;
  private resolveShow: (() => void) | null = null;
  private activeShowPromise: Promise<void> | null = null;
  private showRequestId = 0;

  constructor(
    private readonly app: Application,
    private readonly layer: Container,
    domParent: HTMLElement
  ) {
    this.overlay.visible = false;
    this.overlay.addChild(this.backdrop);
    this.layer.addChild(this.overlay);

    this.domOverlay = document.createElement("div");
    this.domOverlay.className = "joker-popup-hit-area is-hidden";
    this.domOverlay.setAttribute("aria-hidden", "true");
    domParent.appendChild(this.domOverlay);

    // A click/tap anywhere dismisses the popup. Gate on `idle` so a stray tap right
    // as the popup appears can't cut off the intro before the user has seen it.
    this.domOverlay.addEventListener("click", () => {
      if (this.state === "idle") this.close();
    });
    window.addEventListener("keydown", this.handleKeyDown);
  }

  /** Tear down the popup: stop it, detach the DOM overlay, and unbind the global key listener. */
  destroy(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.hideImmediately();
    this.destroySpine();
    this.domOverlay.remove();
    this.layer.removeChild(this.overlay);
    this.overlay.destroy({ children: true });
  }

  show(shouldShow: () => boolean = () => true): Promise<void> {
    if (this.activeShowPromise) return this.activeShowPromise;

    const requestId = ++this.showRequestId;
    this.activeShowPromise = this.showInternal(requestId, shouldShow).finally(() => {
      this.activeShowPromise = null;
    });

    return this.activeShowPromise;
  }

  private async showInternal(requestId: number, shouldShow: () => boolean): Promise<void> {
    await preloadJokerPopupAssets();
    if (requestId !== this.showRequestId || !shouldShow()) return;

    this.createSpine();
    this.layout();
    this.setDomVisible(true);
    this.overlay.visible = true;
    this.state = "intro";
    this.stateElapsed = 0;
    this.autoCloseElapsed = 0;
    this.spine?.state.setAnimation(0, "intro", false);

    return new Promise((resolve) => {
      this.resolveShow = resolve;
    });
  }

  hideImmediately(): void {
    this.showRequestId++;
    if (this.state === "hidden") {
      this.resolveShow?.();
      this.resolveShow = null;
      return;
    }
    this.hide();
  }

  close(): void {
    if (this.state === "hidden" || this.state === "outro" || !this.spine) return;

    this.state = "outro";
    this.stateElapsed = 0;
    this.spine.state.setAnimation(0, "outro", false);
    this.setDomVisible(false);
  }

  update(deltaSeconds: number): void {
    if (this.state === "hidden" || !this.spine) return;

    this.spine.update(deltaSeconds);
    this.stateElapsed += deltaSeconds;

    if (this.state === "intro") {
      if (this.stateElapsed >= this.getAnimationDuration("intro")) {
        this.state = "idle";
        this.stateElapsed = 0;
        this.autoCloseElapsed = 0;
        this.spine.state.setAnimation(0, "idle", true);
      }
      return;
    }

    if (this.state === "idle") {
      if (this.stateElapsed >= POPUP_IDLE_DELAY_SECONDS) {
        this.autoCloseElapsed += deltaSeconds;
      }
      if (this.autoCloseElapsed >= POPUP_AUTO_CLOSE_SECONDS) {
        this.close();
      }
      return;
    }

    if (this.state === "outro" && this.stateElapsed >= this.getAnimationDuration("outro")) {
      this.hide();
    }
  }

  layout(): void {
    this.backdrop.clear();
    this.backdrop.rect(0, 0, this.app.screen.width, this.app.screen.height);
    this.backdrop.fill({ color: 0x050505, alpha: 0.66 });

    if (!this.spine) return;

    const bounds = this.popupBounds ?? this.spine.skeleton.getBoundsRect();
    const scale = Math.min(
      (this.app.screen.width * POPUP_MAX_SCREEN_FILL) / Math.max(bounds.width, 1),
      (this.app.screen.height * POPUP_MAX_SCREEN_FILL) / Math.max(bounds.height, 1)
    );

    this.spine.scale.set(scale);
    this.spine.x = this.app.screen.width / 2 - (bounds.x + bounds.width / 2) * scale;
    this.spine.y = this.app.screen.height / 2 - (bounds.y + bounds.height / 2) * scale;
  }

  private createSpine(): void {
    this.destroySpine();
    this.spine = Spine.from({
      skeleton: POPUP_SKELETON_ALIAS,
      atlas: POPUP_ATLAS_ALIAS,
      autoUpdate: false,
      scale: 1
    });
    this.spine.state.data.defaultMix = animationMixDurationSeconds;
    this.cachedPopupBounds ??= this.calculatePopupBounds(this.spine);
    this.popupBounds = this.cachedPopupBounds;
    this.spine.state.setAnimation(0, "idle", true);
    this.spine.update(0);
    this.overlay.addChild(this.spine);
  }

  private hide(): void {
    this.state = "hidden";
    this.stateElapsed = 0;
    this.autoCloseElapsed = 0;
    this.overlay.visible = false;
    this.setDomVisible(false);
    this.destroySpine();
    this.popupBounds = null;
    this.resolveShow?.();
    this.resolveShow = null;
  }

  private destroySpine(): void {
    if (!this.spine) return;

    this.overlay.removeChild(this.spine);
    this.spine.destroy({ children: true });
    this.spine = null;
  }

  private calculatePopupBounds(spine: Spine): PopupBounds {
    const bounds: PopupBounds = {
      x: Number.POSITIVE_INFINITY,
      y: Number.POSITIVE_INFINITY,
      width: 0,
      height: 0
    };

    for (const animationName of ["intro", "idle", "outro"]) {
      const animation = spine.skeleton.data.findAnimation(animationName);
      if (!animation) continue;

      const steps = Math.max(2, Math.ceil(animation.duration / 0.1));
      for (let step = 0; step <= steps; step++) {
        const time = (animation.duration * step) / steps;
        spine.skeleton.setupPose();
        spine.state.clearTracks();
        const entry = spine.state.setAnimation(0, animationName, animationName === "idle");
        entry.trackTime = time;
        entry.setAnimationLast(time);
        spine.update(0);
        expandBounds(bounds, spine.skeleton.getBoundsRect());
      }
    }

    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
      return spine.skeleton.getBoundsRect();
    }

    return bounds;
  }

  private getAnimationDuration(animationName: string): number {
    return this.spine?.skeleton.data.findAnimation(animationName)?.duration ?? 0;
  }

  private setDomVisible(visible: boolean): void {
    this.domOverlay.classList.toggle("is-hidden", !visible);
    this.domOverlay.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.close();
  };
}

function expandBounds(target: PopupBounds, next: PopupBounds): void {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
    target.x = next.x;
    target.y = next.y;
    target.width = next.width;
    target.height = next.height;
    return;
  }

  const minX = Math.min(target.x, next.x);
  const minY = Math.min(target.y, next.y);
  const maxX = Math.max(target.x + target.width, next.x + next.width);
  const maxY = Math.max(target.y + target.height, next.y + next.height);

  target.x = minX;
  target.y = minY;
  target.width = maxX - minX;
  target.height = maxY - minY;
}

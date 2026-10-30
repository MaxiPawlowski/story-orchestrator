export interface BackgroundLayer {
  image: string;
  size: string;
  position: string;
  repeat: string;
  filter: string;
}

const backgroundElement = (): HTMLElement | null => (typeof document === "undefined" ? null : document.getElementById("bg1"));

// `#bg1` transitions its background-image (backgrounds.css), so the computed value lags a switch;
// the inline style ST writes (backgrounds.js:251, :266, :1442) is the target, read first.
export function readBackgroundLayer(): BackgroundLayer | null {
  const element = backgroundElement();
  if (!element || typeof getComputedStyle !== "function") return null;
  const style = getComputedStyle(element);
  const image = element.style.backgroundImage || style.backgroundImage;
  if (!image || image === "none") return null;
  return { image, size: style.backgroundSize, position: style.backgroundPosition, repeat: style.backgroundRepeat, filter: style.filter === "none" ? "" : style.filter };
}

export function watchBackgroundLayer(listener: (previous: BackgroundLayer | null, next: BackgroundLayer | null) => void): () => void {
  const element = backgroundElement();
  if (!element || typeof MutationObserver === "undefined") return () => undefined;
  let last = readBackgroundLayer();
  const observer = new MutationObserver(() => {
    const next = readBackgroundLayer();
    if (next?.image === last?.image) return;
    const previous = last;
    last = next;
    listener(previous, next);
  });
  observer.observe(element, { attributes: true, attributeFilter: ["style", "class"] });
  return () => observer.disconnect();
}

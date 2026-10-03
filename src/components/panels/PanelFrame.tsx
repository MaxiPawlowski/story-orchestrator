import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { clampPanel, docked, isPanelKey, movedBy, type PanelGeometry, type Viewport } from "@runtime/panelGeometry";

export interface PanelFrameProps {
  id: string;
  title: string;
  geometry: PanelGeometry;
  onChange: (geometry: PanelGeometry) => void;
  onClose: () => void;
  children: ReactNode;
  viewport?: Viewport;
}

const windowViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

type DragKind = "move" | "resize";

const dragged = (kind: DragKind, from: PanelGeometry, dx: number, dy: number): PanelGeometry => (kind === "move"
  ? { ...from, x: from.x + dx, y: from.y + dy }
  : { ...from, w: from.w + dx, h: from.h + dy });

export const PanelFrame = ({ id, title, geometry, onChange, onClose, children, viewport }: PanelFrameProps) => {
  const [view, setView] = useState<Viewport>(() => viewport ?? windowViewport());
  const [geom, setGeom] = useState<PanelGeometry>(() => clampPanel(geometry, viewport ?? windowViewport()));
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (viewport) {
      setView(viewport);
      setGeom((current) => clampPanel(current, viewport));
      return undefined;
    }
    const onResize = () => {
      const next = windowViewport();
      setView(next);
      setGeom((current) => clampPanel(current, next));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [viewport]);

  useEffect(() => () => stop.current?.(), []);

  const isDocked = docked(view);

  const begin = (kind: DragKind) => (event: ReactPointerEvent<HTMLElement>) => {
    if (isDocked || event.button !== 0) return;
    if (kind === "move" && event.target instanceof Element && event.target.closest("button")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const from = geom;
    let last = from;
    const move = (next: PointerEvent) => {
      last = clampPanel(dragged(kind, from, next.clientX - startX, next.clientY - startY), view);
      setGeom(last);
    };
    const up = () => {
      stop.current?.();
      onChange(last);
    };
    stop.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stop.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onBarKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (isDocked || !isPanelKey(event.key)) return;
    event.preventDefault();
    const next = movedBy(geom, event.key, view);
    setGeom(next);
    onChange(next);
  };

  const onPanelKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  };

  const style = isDocked ? undefined : { left: geom.x, top: geom.y, width: geom.w, height: geom.h };
  return (
    <section
      id={`so-panel-${id}`}
      data-so="panel"
      data-panel={id}
      data-docked={isDocked}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className={isDocked ? "so-panel so-panel--docked" : "so-panel"}
      style={style}
      onKeyDown={onPanelKey}
    >
      <div
        data-so="panel-bar"
        role="toolbar"
        className="so-panel-bar"
        tabIndex={0}
        aria-label={isDocked ? title : `${title}: drag, or use the arrow keys, to move`}
        onPointerDown={begin("move")}
        onKeyDown={onBarKey}
      >
        <span className="so-panel-title">{title}</span>
        <button type="button" data-so="panel-close" className="menu_button fa-solid fa-xmark" aria-label={`Close ${title}`} title={`Close ${title}`} onClick={onClose} />
      </div>
      <div className="so-panel-body">{children}</div>
      {!isDocked && <div data-so="panel-resize" className="so-panel-resize" aria-hidden="true" onPointerDown={begin("resize")} />}
    </section>
  );
};

export default PanelFrame;

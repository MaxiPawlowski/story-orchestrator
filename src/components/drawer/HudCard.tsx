import { useEffect, useRef, useState } from "react";
import { isEstablished, type MemoryEntry } from "@memory/index";
import { HUD_COPY, pipelineAction } from "@runtime/pipeline";
import type { RuntimeSnapshot } from "@runtime/types";
import { GAME_TEXT } from "@features/gameCopy";
import { PRESENCE_TEXT } from "@features/presenceCopy";

export type HudCardPanel = "journal" | "suggestions";

export interface HudCardActions {
  panels: readonly HudCardPanel[];
  openPanel: (panel: HudCardPanel) => void;
  openMemory: () => void;
}

export interface HudCardProps extends HudCardActions {
  snapshot: RuntimeSnapshot;
  onMore: () => void;
  onClose: (restoreFocus: boolean) => void;
}

const PEEK = 5;

export const memoryPeek = (snapshot: RuntimeSnapshot, limit = PEEK): MemoryEntry[] => (snapshot.memoryShown ?? [])
  .filter((entry) => !entry.supersededBy && (!entry.foldedInto || isEstablished(entry)) && entry.provenance?.validity !== "conflicted")
  .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
  .slice(0, limit);

const PANEL_LABELS: Record<HudCardPanel, { label: string; icon: string; id: string }> = {
  journal: { label: GAME_TEXT.journalLaunch, icon: "fa-book", id: "so-hud-card-journal" },
  suggestions: { label: PRESENCE_TEXT.suggestionsOpen, icon: "fa-lightbulb", id: "so-hud-card-suggestions" },
};

export const HudCard = ({ snapshot, panels, openPanel, openMemory, onMore, onClose }: HudCardProps) => {
  const card = useRef<HTMLElement>(null);
  const [peek, setPeek] = useState(false);
  const now = snapshot.narrative?.sections.find((section) => section.id === "now")?.lines ?? [];
  const action = pipelineAction(snapshot.pipeline);
  const remembered = peek ? memoryPeek(snapshot) : [];

  useEffect(() => {
    card.current?.querySelector<HTMLElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      const root = card.current?.closest("#so-hud-root");
      if (event.target instanceof Node && root && !root.contains(event.target)) onClose(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose(true);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <section ref={card} id="so-hud-card" role="dialog" aria-modal="false" aria-labelledby="so-hud-card-title" className="so-hud-card">
      <div className="so-hud-card-head">
        <h2 id="so-hud-card-title" className="so-hud-card-title">{now[0] ?? HUD_COPY.fallbackScene}</h2>
        <button type="button" id="so-hud-card-close" className="menu_button fa-solid fa-xmark" aria-label={HUD_COPY.cardClose} title={HUD_COPY.cardClose}
          onClick={() => onClose(true)} />
      </div>
      {now[1] ? <p className="so-hud-card-line">{now[1]}</p> : null}
      <p id="so-hud-card-status" className="so-hud-card-status">{snapshot.pipeline.text}{action ? ` ${action}` : ""}</p>
      <div className="so-hud-card-actions">
        {panels.map((panel) => (
          <button key={panel} type="button" id={PANEL_LABELS[panel].id} className="menu_button so-launcher" onClick={() => { onClose(false); openPanel(panel); }}>
            <i className={`fa-solid ${PANEL_LABELS[panel].icon}`} aria-hidden="true" /><span>{PANEL_LABELS[panel].label}</span>
          </button>
        ))}
        <button type="button" id="so-hud-card-memory" className="menu_button so-launcher" aria-expanded={peek} aria-controls="so-hud-card-peek" onClick={() => setPeek((open) => !open)}>
          <i className="fa-solid fa-brain" aria-hidden="true" /><span>{HUD_COPY.cardMemory}</span>
        </button>
        <button type="button" id="so-hud-card-more" className="menu_button so-launcher" title={HUD_COPY.cardMoreTitle} onClick={() => { onClose(false); onMore(); }}>
          <span>{HUD_COPY.cardMore}</span>
        </button>
      </div>
      {peek && (
        <div id="so-hud-card-peek" className="so-hud-card-peek">
          {remembered.length
            ? <ul>{remembered.map((entry) => <li key={entry.id} data-so="hud-card-memory">{entry.text}</li>)}</ul>
            : <p>{HUD_COPY.cardMemoryEmpty}</p>}
          <button type="button" id="so-hud-card-memory-all" className="menu_button" onClick={() => { onClose(false); openMemory(); }}>{HUD_COPY.cardMemoryAll}</button>
        </div>
      )}
    </section>
  );
};

export default HudCard;

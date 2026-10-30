import { isEstablished, type MemoryEntry } from "@memory/index";
import { SHEET_TEXT } from "@features/sheetCopy";
import type { ChatPanel } from "./chatPanels";
import type { RuntimeSnapshot } from "./types";

export type SheetTab = "journal" | "here" | "people" | "stats" | "ideas" | "memory" | `widget-${string}`;

export interface SheetTabEntry {
  id: SheetTab;
  label: string;
  icon: string;
}

const WIDGET_ICON = "fa-table-columns";

export const sheetTabs = (snapshot: RuntimeSnapshot): SheetTabEntry[] => {
  if (!snapshot.ready) return [];
  const game = snapshot.game ?? null;
  const shown = snapshot.presence?.shown;
  const pages = Boolean(game && shown?.journal);
  const tabs: SheetTabEntry[] = [];
  if (pages && game && (game.journal.length || game.milestones.length || game.observations)) tabs.push({ id: "journal", label: SHEET_TEXT.journal, icon: "fa-book" });
  if (pages && game?.scene) tabs.push({ id: "here", label: SHEET_TEXT.here, icon: "fa-user-group" });
  if (pages && game?.codex && (game.codex.people.length || game.codex.places.length)) tabs.push({ id: "people", label: SHEET_TEXT.people, icon: "fa-address-book" });
  if (game?.statSheet && shown?.statSheet) tabs.push({ id: "stats", label: SHEET_TEXT.stats, icon: "fa-list-check" });
  if (game && shown?.widgets) {
    for (const widget of game.widgets) {
      if (widget.body.kind === "scene" && game.scene) continue;
      tabs.push({ id: `widget-${widget.id}`, label: widget.title, icon: WIDGET_ICON });
    }
  }
  if (shown?.suggestions === true) tabs.push({ id: "ideas", label: SHEET_TEXT.ideas, icon: "fa-lightbulb" });
  if (Array.isArray(snapshot.memoryShown)) tabs.push({ id: "memory", label: SHEET_TEXT.memory, icon: "fa-brain" });
  return tabs;
};

export const pickSheetTab = (tabs: readonly SheetTabEntry[], wanted: SheetTab | null): SheetTab | null =>
  (wanted && tabs.some((tab) => tab.id === wanted) ? wanted : tabs[0]?.id ?? null);

export const sheetTabForPanel = (panel: ChatPanel, tabs: readonly SheetTabEntry[]): SheetTab | null => {
  if (panel === "journal") return "journal";
  if (panel === "stat-sheet") return "stats";
  if (panel === "suggestions") return "ideas";
  return tabs.find((tab) => tab.id.startsWith("widget-"))?.id ?? (tabs.some((tab) => tab.id === "here") ? "here" : null);
};

export const MEMORY_PEEK = 5;

export const memoryPeek = (snapshot: Pick<RuntimeSnapshot, "memoryShown">, limit = MEMORY_PEEK): MemoryEntry[] => (snapshot.memoryShown ?? [])
  .filter((entry) => !entry.supersededBy && (!entry.foldedInto || isEstablished(entry)) && entry.provenance?.validity !== "conflicted")
  .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.createdAt ?? 0) - (a.createdAt ?? 0))
  .slice(0, limit);

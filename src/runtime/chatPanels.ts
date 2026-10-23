import type { RuntimeSnapshot } from "./types";

export type ChatPanel = "journal" | "stat-sheet" | "widgets" | "suggestions";

export const gamePanels = (snapshot: RuntimeSnapshot) => {
  const game = snapshot.ready ? snapshot.game ?? null : null;
  const shown = snapshot.presence?.shown;
  return {
    game, journal: Boolean(game && shown?.journal && (game.journal.length || game.milestones.length || game.codex)), statSheet: Boolean(game?.statSheet && shown?.statSheet),
    widgets: game && shown?.widgets ? game.widgets : [],
  };
};

export const chatPanelsShown = (snapshot: RuntimeSnapshot): ChatPanel[] => {
  const game = gamePanels(snapshot);
  return [
    ...(game.journal ? ["journal" as const] : []),
    ...(game.statSheet ? ["stat-sheet" as const] : []),
    ...(game.widgets.length ? ["widgets" as const] : []),
    ...(snapshot.ready && snapshot.presence?.shown.suggestions === true ? ["suggestions" as const] : []),
  ];
};

export const castPanelShown = (snapshot: RuntimeSnapshot): boolean => snapshot.ui.authorView;

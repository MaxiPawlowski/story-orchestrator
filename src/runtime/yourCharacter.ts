import type { PlayerSetupView } from "./playerSetup";

export const yourCharacterLines = (view: PlayerSetupView | null | undefined): string[] => {
  if (!view) return [];
  const name = view.lockedName ?? view.current?.name ?? null;
  return [
    ...(name ? [`Playing as ${name}.`] : []),
    ...(view.player?.role ? [`In this story you are ${view.player.role}.`] : []),
    ...(view.player?.summary ? [view.player.summary] : []),
    ...(view.player?.assumes?.length ? [`The story takes for granted: ${view.player.assumes.join("; ")}.`] : []),
  ];
};

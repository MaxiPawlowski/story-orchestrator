import type { UiRuntimeSettings } from "./types";

export const HOST_STYLE_FLAGS = { compactThoughts: "soCompactThoughts" } as const;

export const applyHostStyle = (root: Pick<HTMLElement, "dataset">, ui: Pick<UiRuntimeSettings, "compactThoughts"> | undefined): void => {
  if (ui?.compactThoughts !== false) root.dataset[HOST_STYLE_FLAGS.compactThoughts] = "";
  else delete root.dataset[HOST_STYLE_FLAGS.compactThoughts];
};

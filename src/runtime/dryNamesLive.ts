import { draftedCardName, getContext, getPlayerName, observeSamplerPayloads } from "@services/STAPI";
import { dryNamesHandler } from "./dryNames";
import type { GenerationLifecycle } from "./generationLifecycle";
import { runtimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";

export const startLiveDryNames = (generation: GenerationLifecycle): (() => void) => {
  const handle = dryNamesHandler({
    enabled: () => getGlobalSettings().talk.dryNames,
    storyChat: () => runtimeManager.getLoadedChatId(),
    story: () => runtimeManager.getStory(),
    player: () => getPlayerName(),
    drafted: draftedCardName,
    onStage: () => {
      const context = getContext();
      const group = context.groups.find((entry) => String(entry.id) === String(context.groupId ?? ""));
      const off = group?.disabled_members ?? [];
      return (group?.members ?? []).filter((avatar) => !off.includes(avatar))
        .map((avatar) => context.characters.find((character) => character.avatar === avatar)?.name)
        .filter((name): name is string => typeof name === "string");
    },
    journal: (summary, note) => runtimeManager.noteRecap(summary, note),
  });
  return observeSamplerPayloads({
    textgen: (payload, dryRun) => {
      const open = generation.snapshot();
      handle(payload, { api: "textgen", chatId: getContext().chatId ?? null, type: null, dryRun, open: open.outermost !== null,
        innermost: open.nested.length ? open.nested[open.nested.length - 1] : open.outermost?.type ?? null });
    },
    chat: () => undefined,
  });
};

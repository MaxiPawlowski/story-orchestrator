import { deactivateGlobalLorebook, installStoryLoreScan, listGlobalLorebooks, loadScanLorebook, showConfirmPopup } from "@services/STAPI";
import { getGlobalSettings, setGlobalSettings } from "./settingsStore";
import { listStoryRecords } from "./storyLibrary";
import { createStoryLore, globalStoryBooks, globalStoryLore, readGlobalStoryBooksWith, setStoryLoreScanned, type StoryLoreScan } from "./storyLore";

export interface StoryLoreWiring {
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => unknown | null;
}

export interface StoryLoreDebug {
  last: () => StoryLoreScan | null;
  books: () => string[];
}

export function startStoryLore(deps: StoryLoreWiring): { reassert: () => void; dispose: () => void } {
  const lore = createStoryLore({
    owner: () => ({ chatId: deps.chatId(), ownedChat: deps.ownedChat(), story: deps.story() }),
    load: loadScanLorebook,
  });
  const handle = installStoryLoreScan(async (arrays) => { await lore.append(arrays); });
  setStoryLoreScanned(handle.ordered);
  const stopReading = readGlobalStoryBooksWith(() => globalStoryBooks(listGlobalLorebooks(), listStoryRecords().map((record) => record.raw), getGlobalSettings().worldInfo.keptGlobal));
  const debug: StoryLoreDebug = { last: lore.last, books: globalStoryLore };
  if (__SO_DEV__) globalThis.storyOrchestratorStoryLore = debug;
  return {
    reassert: handle.reassert,
    dispose: () => {
      handle.dispose();
      setStoryLoreScanned(false);
      stopReading();
      if (__SO_DEV__) globalThis.storyOrchestratorStoryLore = undefined;
    },
  };
}

export async function releaseGlobalStoryLore(): Promise<{ released: string[]; refused: string[] } | null> {
  const books = globalStoryLore();
  if (!books.length) return { released: [], refused: [] };
  const confirmed = await showConfirmPopup([
    `Switch ${books.length === 1 ? "this lorebook" : `these ${books.length} lorebooks`} off for every chat?`,
    ...books,
    "Each story still loads the lorebooks it lists in its own chats. Chats without that story stop seeing them.",
  ].join("\n"), { okButton: "Load with their stories only", cancelButton: "Cancel" });
  if (!confirmed) return null;
  const released: string[] = [];
  const refused: string[] = [];
  for (const book of books) {
    const result = await deactivateGlobalLorebook(book);
    if (result.ok) released.push(result.name);
    else refused.push(`${book}: ${result.reason}`);
  }
  return { released, refused };
}

export function keepGlobalStoryLore(): string[] {
  const books = globalStoryLore();
  const kept = getGlobalSettings().worldInfo.keptGlobal;
  return setGlobalSettings({ worldInfo: { keptGlobal: [...kept, ...books.filter((book) => !kept.includes(book))] } }).worldInfo.keptGlobal;
}

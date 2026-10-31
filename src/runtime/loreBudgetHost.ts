import { observeWorldInfoScanDone, readWorldInfoBudgetCap } from "@services/STAPI";
import type { NormalizedStory } from "@engine/index";
import { loreBudgetLedger, readScanDone, type LoreBudgetLedger } from "./loreBudget";
import { storyBooks } from "./worldInfoEvidenceHost";

export interface LoreBudgetWiring {
  enabled: () => boolean;
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStory | null;
  loud: () => boolean;
  forced: () => ReadonlyArray<{ world: string; uid: number }>;
  notify: () => void;
  observe?: (handler: (args: unknown) => void) => () => void;
  cap?: () => number | null;
  ledger?: LoreBudgetLedger;
}

export function startLoreBudget(deps: LoreBudgetWiring): () => void {
  const ledger = deps.ledger ?? loreBudgetLedger;
  return (deps.observe ?? observeWorldInfoScanDone)((args) => {
    const chatId = deps.chatId();
    const story = deps.story();
    if (!deps.enabled() || !story || chatId === null || chatId !== deps.ownedChat() || !deps.loud()) return;
    const read = readScanDone(args);
    if (!read) return;
    const forced = new Set(deps.forced().map((pick) => `${pick.world}.${pick.uid}`));
    ledger.note(chatId, read, storyBooks(story, null), forced, (deps.cap ?? readWorldInfoBudgetCap)());
    if (read.cut.length || read.loop <= 1) deps.notify();
  });
}

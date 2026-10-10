import { getContext } from "@services/STAPI";
import { askText, type ModelCall } from "@extraction/index";
import type { StoryV2 } from "@engine/index";
import { log } from "@utils/log";
import { BRIEFING_DRAFT_MAX_TOKENS, briefingDraftInput, checkBriefingDraft, renderBriefingDraftPrompt } from "./briefingDraft";
import { beginRun } from "./runToken";
import type { RuntimeManager } from "./runtimeManager";

export type BriefingDraftManager = Pick<RuntimeManager, "getCachedSnapshot" | "getStory" | "getGlobalSettings" | "getOwnership" | "setUiSettings" | "noteRecap" | "subscribe"> & {
  model: ModelCall;
};

export type BriefingDraftOutcome = { ok: true; ms: number } | { ok: false; reason: string };

export const BRIEFING_DRAFT_JOURNAL = {
  landed: "Wrote a briefing for this chat",
  discarded: "A drafted briefing was discarded; the story's introduction stays",
} as const;

export async function draftBriefing(manager: BriefingDraftManager, story: StoryV2, storyId: string, hash: string, clock: () => number = Date.now): Promise<BriefingDraftOutcome> {
  const run = beginRun(manager.getOwnership());
  const started = clock();
  try {
    const raw = await askText(manager.model, renderBriefingDraftPrompt(briefingDraftInput(story)), {
      role: "authoring", pass: "briefing", maxTokens: BRIEFING_DRAFT_MAX_TOKENS, signal: run.signal,
    });
    const ms = clock() - started;
    if (!run.stillOwns()) return { ok: false, reason: "stale" };
    const check = checkBriefingDraft(story, raw);
    if (!check.ok) {
      manager.noteRecap(BRIEFING_DRAFT_JOURNAL.discarded, `${check.reason} (${ms} ms)`);
      return { ok: false, reason: check.reason };
    }
    manager.setUiSettings({ briefingDrafted: { storyId, hash, sections: check.sections, at: new Date(clock()).toISOString() } });
    manager.noteRecap(BRIEFING_DRAFT_JOURNAL.landed, `${check.sections.length} section(s) in ${ms} ms`);
    return { ok: true, ms };
  } catch (error) {
    log.warn("briefing draft: the request failed", error);
    return { ok: false, reason: "failed" };
  }
}

export const briefingDraftDue = (manager: Pick<BriefingDraftManager, "getCachedSnapshot" | "getStory" | "getGlobalSettings">): { story: StoryV2; storyId: string; hash: string } | null => {
  const snapshot = manager.getCachedSnapshot();
  const story = manager.getStory();
  const state = snapshot.briefing;
  const hash = snapshot.storyHash;
  if (!story || !state?.pending || !hash || story.briefing?.sections.length || state.view?.source === "draft") return null;
  return manager.getGlobalSettings().display.briefingDraft ? { story, storyId: state.storyId, hash } : null;
};

export function startBriefingDraft(manager: BriefingDraftManager): () => void {
  const tried = new Set<string>();
  const update = () => {
    const due = briefingDraftDue(manager);
    const chatId = getContext().chatId;
    if (!due || !chatId) return;
    const key = `${chatId}\u0000${due.storyId}\u0000${due.hash}`;
    if (tried.has(key)) return;
    tried.add(key);
    void draftBriefing(manager, due.story, due.storyId, due.hash);
  };
  const off = manager.subscribe(update);
  update();
  return off;
}

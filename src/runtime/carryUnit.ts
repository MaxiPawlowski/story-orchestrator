import { parseStoryV2, type NormalizedStoryV2 } from "@engine/index";
import { isCarryState } from "@engine/carrySchema";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { readGroupChatMetadata } from "@services/STAPI";
import { buildCarryState, candidateChats, carryCandidateFromBlob, type CandidateResult } from "./carryCandidate";
import type { CarryCandidateRow, CarryOutcome } from "./carryPort";
import type { ManagerPort } from "./managerWiring";
import { BLOB_VERSION } from "./persistence";
import { readPlaysIndex } from "./playsIndexHost";
import { beginRun } from "./runToken";
import { shelfCandidates, trophyFromBlob, type TrophyRow } from "./trophyShelf";
import type { ContinueRow } from "./playsIndex";

const refuse = (reason: string): CarryOutcome => ({ ok: false, reason });

export const carryDeps = (port: ManagerPort, refresh: () => void) => ({
  loaded: port.loaded, extras: port.extras, engine: port.engine, chatId: () => String(port.view.hosts.chat.chatId() ?? "") || null,
  ownership: port.lifecycle.ownership, journal: (summary: string, note: string) => port.journal("author", summary, note), refresh,
  persist: port.lifecycle.persist, notify: port.lifecycle.notify,
});

export type CarryDeps = ReturnType<typeof carryDeps>;

const verify = async (target: NormalizedStoryV2, chatId: string): Promise<CandidateResult> => {
  const metadata = await readGroupChatMetadata(chatId).catch(() => null);
  return carryCandidateFromBlob(metadata?.story_orchestrator, chatId, target, { version: BLOB_VERSION, parse: parseStoryV2 });
};

export async function carryCandidates(deps: CarryDeps): Promise<CarryCandidateRow[]> {
  const story = deps.loaded()?.story;
  if (!story?.carry_from) return [];
  const run = beginRun(deps.ownership);
  const rows: CarryCandidateRow[] = [];
  for (const chatId of candidateChats(readPlaysIndex(), story.carry_from.story, deps.chatId())) {
    const result = await verify(story, chatId);
    if (!run.stillOwns()) return [];
    if (result.ok) rows.push({ chatId, title: result.candidate.projection.storyTitle, endingTitle: result.candidate.projection.endingTitle, endedAt: result.candidate.endedAt });
  }
  return rows;
}

export async function trophyShelf(deps: CarryDeps, rows: readonly ContinueRow[]): Promise<TrophyRow[]> {
  await loadGameLayer();
  const run = beginRun(deps.ownership);
  const shelf: TrophyRow[] = [];
  for (const chatId of shelfCandidates(rows)) {
    const metadata = await readGroupChatMetadata(chatId).catch(() => null);
    if (!run.stillOwns()) return [];
    const result = trophyFromBlob(metadata?.story_orchestrator, chatId, { version: BLOB_VERSION, parse: parseStoryV2 });
    if (result.ok) shelf.push(result.row);
  }
  return shelf;
}

export async function pickCarry(deps: CarryDeps, chatId: string): Promise<CarryOutcome> {
  const story = deps.loaded()?.story;
  if (!story?.carry_from) return refuse("this story carries nothing from an earlier run");
  if (deps.extras().carry) return refuse("this chat already chose how to start");
  if (deps.engine.currentBoundary > 0) return refuse("the story has already started; restart it to carry a run");
  const run = beginRun(deps.ownership);
  const result = await verify(story, chatId);
  if (!run.stillOwns()) return refuse("the chat changed while the run was read");
  if (!result.ok) {
    deps.journal("carry refused", `run ${chatId}: ${result.reason}`);
    return refuse(result.reason);
  }
  if (deps.extras().carry || deps.engine.currentBoundary > 0) return refuse("this chat already chose how to start");
  const { state, skipped } = buildCarryState(story, result.candidate, new Date().toISOString());
  deps.extras().carry = state;
  deps.engine.loadStory(story, Object.fromEntries(state.values.map((value) => [value.key, value.value])));
  deps.journal(`carried from "${state.projection.storyTitle}": ${state.values.length} value(s)`, [`run ${chatId}`, ...skipped.map((skip) => skip.reason)].join(" · "));
  deps.refresh();
  await deps.persist();
  if (run.stillOwns()) deps.notify();
  return { ok: true };
}

export async function declineCarry(deps: CarryDeps): Promise<CarryOutcome> {
  const story = deps.loaded()?.story;
  if (!story?.carry_from || deps.extras().carry) return refuse("nothing to decline");
  if (story.carry_from.default === "require") return refuse("this story starts only from a finished run");
  const run = beginRun(deps.ownership);
  deps.extras().carry = { declined: true, at: new Date().toISOString() };
  await deps.persist();
  if (run.stillOwns()) deps.notify();
  return { ok: true };
}

export async function dismissPreviously(deps: CarryDeps): Promise<CarryOutcome> {
  const carry = deps.extras().carry;
  if (!isCarryState(carry) || carry.dismissed) return refuse("nothing to dismiss");
  const run = beginRun(deps.ownership);
  deps.extras().carry = { ...carry, dismissed: true };
  deps.refresh();
  await deps.persist();
  if (run.stillOwns()) deps.notify();
  return { ok: true };
}

import { CLOCK_DAY_KEY, questStatus, valueReader } from "@engine/index";
import type { SharedReadAudit } from "@extraction/index";
import { windowOf } from "@extraction/chatRows";
import type { ParsedArcSignal } from "@memory/index";
import { parsePromiseLine } from "@memory/promises/contract";
import { applyPromiseLines, promiseReminderLines, restatesPromise } from "@memory/promises/impl";
import { createPromises } from "@memory/promises/state";
import type { ParsedPromiseLine, QuestStatusOf } from "@memory/promises/types";
import type { PromisePortDeps } from "./promisePort";
import { namesForRosterId } from "./roster";

const statusOf = (deps: PromisePortDeps): QuestStatusOf => (id) => {
  const quest = deps.getStory()?.quests?.find((entry) => entry.id === id);
  return quest ? questStatus(quest, valueReader(deps.getState()?.blackboard.values ?? {})) : null;
};

const storyDay = (deps: PromisePortDeps): number | null => {
  const value = deps.getState()?.blackboard.values[CLOCK_DAY_KEY];
  return deps.getStory()?.qualityByKey[CLOCK_DAY_KEY] && typeof value === "number" ? value : null;
};

const state = (deps: PromisePortDeps) => deps.extras().promises ?? createPromises();

function apply(deps: PromisePortDeps, audit: SharedReadAudit, arcs: ParsedArcSignal[]): ParsedArcSignal[] {
  const story = deps.getStory();
  const chatId = deps.chatId();
  if (!story || !chatId) return arcs;
  const parsed = (audit.promiseLines ?? []).map((raw) => ({ raw, parsed: parsePromiseLine(raw) }));
  const lines = parsed.flatMap((entry): ParsedPromiseLine[] => ("line" in entry.parsed ? [entry.parsed.line] : []));
  const unparsed = parsed.flatMap((entry) => ("reason" in entry.parsed ? [{ line: entry.raw, reason: entry.parsed.reason }] : []));
  const result = lines.length ? applyPromiseLines(state(deps), lines, {
    chatId, storyId: deps.storyId(), window: deps.chatWindow(audit.window.from, audit.window.to), boundary: deps.getState()?.boundary ?? 0,
    horizonMessageId: deps.historyFloor(), storyDay: storyDay(deps), quests: story.quests ?? [],
    cast: story.roster.map((member) => ({ id: member.id, names: namesForRosterId(story, member.id) })),
  }, [deps.playerName()].filter(Boolean), statusOf(deps)) : null;
  if (result) deps.extras().promises = result.state;
  const refused = [...unparsed, ...(result?.refused ?? [])];
  if (refused.length) deps.journal(`${refused.length} promise line(s) refused`, refused.map((entry) => `${entry.reason}: ${entry.line}`).join("\n"));
  const kept = arcs.filter((arc) => arc.kind !== "open" || !restatesPromise(arc.text, state(deps)));
  const dropped = arcs.filter((arc) => !kept.includes(arc)).map((arc) => ({ line: `[arc] ${arc.text}`, reason: "restates a promise" }));
  audit.rejected = [...audit.rejected, ...unparsed, ...dropped];
  return kept;
}

function reminder(deps: PromisePortDeps, rosterId: string): string[] {
  const story = deps.getStory();
  const current = state(deps);
  const from = Math.min(...current.rows.filter((row) => row.promisee === rosterId).map((row) => row.source.messageId));
  if (!story || !Number.isFinite(from)) return [];
  const chat = windowOf(deps.chatRows(), from).messages.map((message) => ({ index: message.index, speaker: message.speaker, isUser: message.isUser, text: message.text }));
  return promiseReminderLines(current, {
    rosterId, promiseeNames: namesForRosterId(story, rosterId), playerName: deps.playerName() || "{{user}}", chat, questStatus: statusOf(deps), storyDay: storyDay(deps),
  });
}

export const PROMISE_PORT_IMPL = { apply, reminder };

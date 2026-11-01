import { codexEntryKey, codexFactKey, type BoundaryLogEntry, type EngineState, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { codexItems, entryKnown, entryName } from "@engine/codex";
import { clockMoves, timeLabel } from "@engine/life/clock";
import type { SharedReadAudit } from "@extraction/index";
import { isRecord } from "@utils/guards";
import { codexShown } from "./codexView";
import { lineFor, recapWithheld } from "./consequences";
import { defaultChatElements, presenceShown, type ChatElementSettings } from "./displayToggles";
import { gateLeafText, outgoingGateRows } from "./gateReadout";
import type { InChatChips, InChatDiscovery, InChatDivider, InChatMeter, InChatView } from "./inChatTypes";
import { EMPTY_IN_CHAT } from "./inChatTypes";
import { withheldNames } from "./playerProjection";
import type { EffectRef } from "./recapPort";
import { INLINE_WINDOW_DEFAULT, type InlineLevel } from "./settingsModel";
import { makeScreen, offerRows } from "./suggestionAnchors";
import type { TalkDecisionAudit } from "./talkStagecraftTypes";
import type { UiRuntimeSettings } from "./types";
import { deriveTurn } from "./yourMove";

export const METER_OPEN_LIMIT = 3;
export const OFFER_CHIP_LIMIT = 4;

export interface InChatSources {
  story: NormalizedStory | null;
  state: EngineState | null;
  boundaryLog: readonly BoundaryLogEntry[];
  chat: readonly unknown[];
  castNames: Record<string, string>;
  level: InlineLevel;
  ui: Pick<UiRuntimeSettings, "authorView" | "inChat" | "inline" | "presence" | "yourMove">;
  audits: readonly SharedReadAudit[];
  recap: readonly EffectRef[];
  decisions: readonly TalkDecisionAudit[];
  resting?: (text: string) => string;
  enabled?: readonly string[];
  generating?: boolean;
}

type Values = Readonly<Record<string, PrimitiveValue>>;

const push = <T>(into: Record<number, T[]>, at: number, item: T) => { (into[at] ??= []).push(item); };

const isUserRow = (row: unknown): boolean => isRecord(row) && row.is_user === true;

export function inChatDividers(story: NormalizedStory, log: readonly BoundaryLogEntry[], audits: readonly SharedReadAudit[], inWindow: (id: number) => boolean): Record<number, InChatDivider> {
  const dividers: Record<number, InChatDivider> = {};
  const clock = story.life?.clock;
  if (clock) {
    for (const move of clockMoves(story, log)) {
      if (move.messageId > 0 && inWindow(move.messageId)) dividers[move.messageId] = { time: timeLabel(clock, story.life?.calendar, move.to), scene: false };
    }
  }
  for (const audit of audits) {
    const at = audit.sceneBreak?.at;
    if (typeof at !== "number" || !Number.isInteger(at) || at <= 0 || !inWindow(at)) continue;
    dividers[at] = { time: dividers[at]?.time ?? null, scene: true };
  }
  return dividers;
}

export function inChatBecause(story: NormalizedStory, state: EngineState, refs: readonly EffectRef[], chat: readonly unknown[], inWindow: (id: number) => boolean): Record<number, string[]> {
  const withheld = recapWithheld(story, state);
  const revisions = new Map<number, string | null>();
  const because: Record<number, string[]> = {};
  for (const ref of refs) {
    if (!inWindow(ref.messageId)) continue;
    const line = lineFor(story, ref, chat, withheld, revisions);
    if (line?.because && !(because[ref.messageId] ?? []).includes(line.text)) push(because, ref.messageId, line.text);
  }
  return because;
}

export function inChatDiscovery(story: NormalizedStory, values: Values, log: readonly BoundaryLogEntry[], castNames: Record<string, string>,
  inWindow: (id: number) => boolean): Record<number, InChatDiscovery[]> {
  const discovery: Record<number, InChatDiscovery[]> = {};
  if (!codexShown(story)) return discovery;
  const items = codexItems(story).filter(({ page, entry }) => entryKnown(page, entry, values));
  for (const entry of log) {
    const messageId = entry.context.lastMessageId;
    if (!inWindow(messageId)) continue;
    const before = entry.before.blackboard.values;
    const after = entry.after.blackboard.values;
    const landed = (key: string) => before[key] === undefined && after[key] !== undefined && values[key] !== undefined;
    for (const { page, entry: item } of items) {
      const first = landed(codexEntryKey(page, item.id));
      const facts = item.facts.filter((fact) => landed(codexFactKey(page, item.id, fact.id))).map((fact) => fact.text.trim()).filter(Boolean);
      if (!first && !facts.length) continue;
      push(discovery, messageId, { key: `${page}:${item.id}:${entry.boundary}`, page, name: entryName(story, item, castNames), first, facts });
    }
  }
  return discovery;
}

export function inChatMeters(story: NormalizedStory, log: readonly BoundaryLogEntry[], inWindow: (id: number) => boolean): Record<number, InChatMeter> {
  const meters: Record<number, InChatMeter> = {};
  for (const entry of log) {
    const messageId = entry.context.lastMessageId;
    if (!inWindow(messageId)) continue;
    const rows = outgoingGateRows(story, entry.after.activeCheckpointId, entry.after.blackboard.values).map((row) => ({
      toName: row.toName, met: row.leaves.filter((leaf) => leaf.met).length, total: row.leaves.length, ready: row.met,
      open: row.leaves.filter((leaf) => !leaf.met).slice(0, METER_OPEN_LIMIT).map(gateLeafText),
    }));
    const moved = entry.fired ? story.checkpointById[entry.fired.to]?.name ?? entry.fired.to : null;
    if (rows.length || moved) meters[messageId] = { rows, moved };
  }
  return meters;
}

export function inChatChips(sources: InChatSources, story: NormalizedStory, state: EngineState): InChatChips | null {
  const lastId = sources.chat.length - 1;
  if (lastId < 0 || sources.generating || isUserRow(sources.chat[lastId])) return null;
  const values = state.blackboard.values;
  const screen = makeScreen({
    story, values, enabled: sources.enabled ?? [], resting: sources.resting ?? ((text) => text),
    unseen: withheldNames(story, state.visitedPath, state.activeCheckpointId, values),
  });
  const offers = offerRows(story, state, screen).available.slice(0, OFFER_CHIP_LIMIT).map((offer) => ({ key: offer.id, text: offer.text.trim() }));
  const yours = sources.ui.yourMove !== false && deriveTurn({ enabled: true, generating: false, chat: sources.chat, checkpointId: state.activeCheckpointId, decisions: sources.decisions }).yours;
  const ideas = sources.ui.presence ? presenceShown(story.display, sources.ui.presence).suggestions : false;
  return yours || offers.length || ideas ? { messageId: lastId, yours, offers, ideas } : null;
}

export function composeInChat(sources: InChatSources): InChatView {
  const { story, state } = sources;
  if (!story || !state || sources.level < 1) return EMPTY_IN_CHAT;
  const on: ChatElementSettings = sources.ui.inChat ?? defaultChatElements();
  const author = sources.ui.authorView && sources.level >= 3;
  const window = Math.max(1, sources.ui.inline?.window ?? INLINE_WINDOW_DEFAULT);
  const oldest = sources.chat.length - window;
  const inWindow = (messageId: number) => messageId >= oldest && messageId < sources.chat.length;
  return {
    player: true, author,
    dividers: on.dividers ? inChatDividers(story, sources.boundaryLog, sources.audits, inWindow) : {},
    because: on.because ? inChatBecause(story, state, sources.recap, sources.chat, inWindow) : {},
    discovery: on.discovery ? inChatDiscovery(story, state.blackboard.values, sources.boundaryLog, sources.castNames, inWindow) : {},
    meter: on.gateMeter && author ? inChatMeters(story, sources.boundaryLog, inWindow) : {},
    chips: on.chips ? inChatChips(sources, story, state) : null,
  };
}

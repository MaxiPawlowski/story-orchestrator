import { PARTY_LOCATION_KEY, codexEntryKey, type BoundaryLogEntry, type CodexEntry, type CodexPage, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import type { LoreBinding } from "@engine/loreBindingSchema";
import { entryKnown } from "@engine/codex";
import type { HostScannableEntry } from "@services/STAPI";
import type { WriteResult } from "@utils/writeResult";
import { beginRun, type RunOwnership } from "./runToken";

type Values = Readonly<Record<string, PrimitiveValue>>;

export type LorePinReason = "here" | "met";

export interface LorePinBinding extends LoreBinding {
  reason: LorePinReason;
}

export type LorePinRefusal = "missing" | "switched-off" | "secret";

export interface LorePinPlan {
  entries: HostScannableEntry[];
  pinned: Array<{ world: string; uid: number; comment: string; reason: LorePinReason }>;
  refused: Array<{ book: string; entry: string; reason: LorePinRefusal }>;
}

export type ChatRow = { is_user?: unknown; is_system?: unknown } | null | undefined;

const fold = (text: string) => text.trim().toLowerCase();

const lastPlayerAt = (rows: readonly ChatRow[], before: number): number => {
  for (let index = Math.min(before, rows.length) - 1; index >= 0; index -= 1) {
    if (rows[index]?.is_user && !rows[index]?.is_system) return index;
  }
  return -1;
};

export function roundBoundaries(log: readonly BoundaryLogEntry[], rows: readonly ChatRow[]): Set<number> {
  const player = lastPlayerAt(rows, rows.length);
  const after = log.filter((entry) => entry.context.lastMessageId > player);
  if (after.length || player < 0) return new Set(after.map((entry) => entry.boundary));
  const previous = lastPlayerAt(rows, player);
  return new Set(log.filter((entry) => entry.context.lastMessageId > previous && entry.context.lastMessageId < player).map((entry) => entry.boundary));
}

const codexOf = (story: NormalizedStory, page: CodexPage): CodexEntry[] => story.codex?.[page] ?? [];

const hereKnown = (story: NormalizedStory, place: string, values: Values): boolean =>
  codexOf(story, "places").filter((entry) => entry.location === place).every((entry) => entryKnown("places", entry, values));

export function lorePinBindings(story: NormalizedStory, values: Values, round: ReadonlySet<number>): LorePinBinding[] {
  const places = story.requirements?.place_lore ?? {};
  const people = story.requirements?.people_lore ?? {};
  const out: LorePinBinding[] = [];
  const add = (binding: LoreBinding | undefined, reason: LorePinReason) => {
    if (binding && !out.some((held) => fold(held.book) === fold(binding.book) && held.entry === binding.entry)) out.push({ ...binding, reason });
  };
  const here = values[PARTY_LOCATION_KEY];
  if (typeof here === "string" && here && hereKnown(story, here, values)) add(places[here], "here");
  const latchedThisRound = (page: CodexPage, entry: CodexEntry) => {
    const at = values[codexEntryKey(page, entry.id)];
    return typeof at === "number" && round.has(at);
  };
  for (const entry of codexOf(story, "places")) {
    if (entry.location && latchedThisRound("places", entry)) add(places[entry.location], "met");
  }
  for (const entry of codexOf(story, "people")) {
    if (latchedThisRound("people", entry)) add(people[entry.id], "met");
  }
  return out;
}

export function lorePinPlan(scannable: readonly HostScannableEntry[], bindings: readonly LorePinBinding[], restatesSecret: (text: string) => boolean): LorePinPlan {
  const plan: LorePinPlan = { entries: [], pinned: [], refused: [] };
  for (const binding of bindings) {
    const entry = scannable.find((candidate) => fold(candidate.world) === fold(binding.book) && String(candidate.comment ?? "").trim() === binding.entry);
    const refusal: LorePinRefusal | null = !entry ? "missing" : entry.disable === true ? "switched-off" : restatesSecret(String(entry.content ?? "")) ? "secret" : null;
    if (refusal || !entry) {
      plan.refused.push({ book: binding.book, entry: binding.entry, reason: refusal ?? "missing" });
      continue;
    }
    plan.entries.push(entry);
    plan.pinned.push({ world: entry.world, uid: entry.uid, comment: String(entry.comment ?? ""), reason: binding.reason });
  }
  return plan;
}

export interface LorePinDeps {
  enabled: () => boolean;
  chatId: () => string | null;
  ownedChat: () => string | null;
  story: () => NormalizedStory | null;
  values: () => Values | null;
  log: () => readonly BoundaryLogEntry[];
  rows: () => readonly unknown[];
  scannable: () => Promise<HostScannableEntry[]>;
  force: (entries: HostScannableEntry[]) => Promise<WriteResult<{ entries: number }>>;
  restatesSecret: (text: string) => boolean;
  ownership: RunOwnership;
}

export async function pinLore(deps: LorePinDeps, withheld: boolean): Promise<LorePinPlan | null> {
  if (withheld || !deps.enabled()) return null;
  const story = deps.story();
  const values = deps.values();
  const chatId = deps.chatId();
  if (!story || !values || chatId === null || chatId !== deps.ownedChat()) return null;
  const bindings = lorePinBindings(story, values, roundBoundaries(deps.log(), deps.rows() as readonly ChatRow[]));
  if (!bindings.length) return null;
  const run = beginRun(deps.ownership);
  const scannable = await deps.scannable();
  if (!run.stillOwns() || deps.story() !== story) return null;
  const plan = lorePinPlan(scannable, bindings, deps.restatesSecret);
  if (!plan.entries.length) return plan;
  if (!run.stillOwns()) return null;
  return (await deps.force(plan.entries)).ok ? plan : { ...plan, entries: [], pinned: [] };
}

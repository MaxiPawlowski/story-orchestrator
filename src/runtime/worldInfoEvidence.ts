import { gatedWorldInfo, type NormalizedStoryV2 } from "@engine/index";
import type { RunContext } from "./runToken";
import { worldInfoPlan } from "./worldInfoGates";
import { entryComment, firstMatch, sameLorebook } from "./worldInfoMatch";

// What ST's World Info scans actually activated, per loud generation,
// so "we forced it" and "we enabled it" stop standing in for evidence. The ring is in memory only;
// the two miss flags it raises are what gets persisted, as journal records.
export const LORE_EVIDENCE_LIMIT = 20;
export const HIDDEN_GENERATIONS_FOR_REPAIR = 2;
export const MIRROR_COMMENT_PREFIX = "so_";

export interface ScanInput {
  world?: unknown;
  uid?: unknown;
  comment?: unknown;
  constant?: unknown;
  disable?: unknown;
  key?: unknown;
  characterFilter?: unknown;
  content?: unknown;
}

export interface ScannedEntry {
  world: string;
  uid: number;
  comment: string;
  constant: boolean;
  key0: string | null;
}

export interface LoadedCopy {
  world: string;
  uid: number;
  comment: string;
  constant: boolean;
  disable: boolean;
  filtered?: boolean;
}

export interface LoreScan {
  tag: string;
  loud: boolean;
  entries: ScannedEntry[];
}

export interface EntryRef {
  world: string;
  uid: number;
  comment: string;
}

export interface LoreSlot {
  chatId: string;
  epoch: number;
  revision: number;
  type: string | null;
  openedAt: string;
  closedAt: string | null;
  rendered: boolean | null;
  lastMessageId: number | null;
  scans: LoreScan[];
  forced: EntryRef[];
  landed: EntryRef[];
  lost: EntryRef[];
  constantMissed: Array<{ lorebook: string; comment: string }>;
}

export type LoreFlag =
  | { kind: "lore-force-lost"; summary: string; detail: string; lost: EntryRef[] }
  | { kind: "lore-constant-missed"; summary: string; detail: string; missed: Array<{ lorebook: string; comment: string }> };

export type FiredOrigin = "gated" | "pick" | "mirror" | "other";

export interface FiredView extends ScannedEntry {
  origin: FiredOrigin;
}

export interface LoreEvidenceView {
  last: (Omit<LoreSlot, "scans"> & { fired: FiredView[]; scanCount: number; nestedScans: number }) | null;
  hiddenBooks: string[];
}

export interface LoreEvidenceHost {
  chatId: () => string | null;
  context: () => RunContext;
  now?: () => string;
}

const uidOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function toScanned(entry: ScanInput): ScannedEntry | null {
  const uid = uidOf(entry.uid);
  if (typeof entry.world !== "string" || uid === null) return null;
  const key0 = Array.isArray(entry.key) && typeof entry.key[0] === "string" ? entry.key[0] : null;
  return { world: entry.world, uid, comment: entryComment(entry), constant: entry.constant === true, key0 };
}

const listed = (value: unknown) => Array.isArray(value) && value.length > 0;

const characterFiltered = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const filter = value as { names?: unknown; tags?: unknown };
  return listed(filter.names) || listed(filter.tags);
};

export function toLoadedCopy(entry: ScanInput): LoadedCopy | null {
  const scanned = toScanned(entry);
  return scanned ? {
    world: scanned.world,
    uid: scanned.uid,
    comment: scanned.comment,
    constant: scanned.constant,
    disable: entry.disable === true,
    filtered: characterFiltered(entry.characterFilter),
  } : null;
}

const refKey = (ref: { world: string; uid: number }) => `${ref.world.toLowerCase()}\u0000${ref.uid}`;

export const firedEntries = (scans: LoreScan[], loudOnly = true): ScannedEntry[] => {
  const seen = new Map<string, ScannedEntry>();
  for (const scan of scans) if (!loudOnly || scan.loud) for (const entry of scan.entries) seen.set(refKey(entry), entry);
  return [...seen.values()];
};

// `LoreSelection.landed` / `lost` (flag a): a forced pick lands only if a loud scan of the same
// generation activated it. A quiet run nested inside the reply consumes a force as surely as a foreign
// dry scan wipes it, and neither is the reply.
export function forcedOutcome(forced: EntryRef[], fired: ScannedEntry[]): { landed: EntryRef[]; lost: EntryRef[] } {
  const firedKeys = new Set(fired.map(refKey));
  return {
    landed: forced.filter((pick) => firedKeys.has(refKey(pick))),
    lost: forced.filter((pick) => !firedKeys.has(refKey(pick))),
  };
}

// Flag b: a constant entry the active gated plan switches ON, which the scan view held enabled,
// and which still did not fire. Budget or probability are the likely causes; the flag only says it did
// not land. Keyword-gated entries are never flagged: not firing is their normal state.
export function constantMisses(story: NormalizedStoryV2, path: string[], loaded: LoadedCopy[], fired: ScannedEntry[]): Array<{ lorebook: string; comment: string }> {
  const firedKeys = new Set(fired.map(refKey));
  const missed: Array<{ lorebook: string; comment: string }> = [];
  for (const plan of worldInfoPlan(story, path)) {
    for (const comment of plan.enable) {
      const copy = firstMatch(loaded, plan.lorebook, comment);
      if (!copy || !copy.constant || copy.disable || copy.filtered) continue;
      if (!firedKeys.has(refKey(copy))) missed.push({ lorebook: plan.lorebook, comment });
    }
  }
  return missed;
}

export function classifyFired(entry: ScannedEntry, story: NormalizedStoryV2 | null, forced: EntryRef[], mirrorBook: string | null): FiredOrigin {
  if (forced.some((pick) => refKey(pick) === refKey(entry))) return "pick";
  if (mirrorBook && sameLorebook(mirrorBook, entry.world) && entry.comment.startsWith(MIRROR_COMMENT_PREFIX)) return "mirror";
  if (story) {
    for (const [lorebook, comments] of gatedWorldInfo([story])) {
      if (sameLorebook(lorebook, entry.world) && comments.has(entry.comment)) return "gated";
    }
  }
  return "other";
}

const summarize = (refs: Array<{ comment: string; world?: string; lorebook?: string }>) => refs.map((ref) => `${ref.lorebook ?? ref.world}: ${ref.comment || "(untitled)"}`).join("; ");

export interface SettleInput {
  rendered: boolean;
  lastMessageId: number;
  story: NormalizedStoryV2 | null;
  path: string[];
  mirrorBook: string | null;
}

export interface OpenInput {
  type: string | null;
  params?: Record<string, unknown>;
}

export class LoreEvidence {
  private slots: LoreSlot[] = [];
  private current: LoreSlot | null = null;
  private loaded: LoadedCopy[] | null = null;
  private hiddenThisSlot = new Set<string>();
  private seenThisSlot = new Set<string>();
  private hiddenRuns = new Map<string, Map<string, number>>();
  private mirror = new Map<string, { eligible: number; fired: number }>();
  private host: LoreEvidenceHost | null = null;
  private settledSlot: LoreSlot | null = null;
  private texts = new WeakMap<LoreSlot, Map<string, { comment: string; text: string; constant: boolean }>>();

  attach(host: LoreEvidenceHost | null) {
    this.host = host;
    if (!host) {
      this.settledSlot = null;
      this.slots = [];
      this.current = null;
      this.hiddenRuns.clear();
    }
  }

  opened(input: OpenInput) {
    const host = this.host;
    if (!host) return;
    const context = host.context();
    this.current = {
      chatId: host.chatId() ?? "",
      epoch: context.sessionEpoch,
      revision: context.windowRevision,
      type: input.type,
      openedAt: this.now(),
      closedAt: null,
      rendered: null,
      lastMessageId: null,
      scans: [],
      forced: [],
      landed: [],
      lost: [],
      constantMissed: [],
    };
    this.loaded = null;
    this.hiddenThisSlot = new Set();
    this.seenThisSlot = new Set();
  }

  scanned(entries: ScanInput[], tag: string, loud: boolean, storyBooks: string[] = []) {
    if (!this.current) return;
    this.current.scans.push({ tag, loud, entries: entries.flatMap((entry) => toScanned(entry) ?? []) });
    if (!loud) return;
    const texts = this.texts.get(this.current) ?? new Map<string, { comment: string; text: string; constant: boolean }>();
    for (const entry of entries) {
      const ref = toScanned(entry);
      if (!ref || typeof entry.content !== "string" || !entry.content.trim() || !storyBooks.some((book) => sameLorebook(book, ref.world))) continue;
      texts.set(refKey(ref), { comment: ref.comment, text: entry.content, constant: ref.constant });
    }
    if (texts.size) this.texts.set(this.current, texts);
  }

  firedLore(messageId: number): Array<{ comment: string; text: string; constant: boolean }> {
    const slot = this.live().filter((candidate) => candidate.rendered === true && candidate.lastMessageId === messageId).pop();
    const texts = slot ? this.texts.get(slot) : undefined;
    return slot && texts ? firedEntries(slot.scans).flatMap((entry) => texts.get(refKey(entry)) ?? []) : [];
  }

  forced(picks: EntryRef[]) {
    if (!this.current) return;
    this.current.forced = picks.map((pick) => ({ world: pick.world, uid: pick.uid, comment: pick.comment }));
  }

  loadedView(entries: ScanInput[]) {
    if (!this.current) return;
    this.loaded = entries.flatMap((entry) => toLoadedCopy(entry) ?? []);
  }

  // A story book present in the scan view before every other listener and absent after all of them:
  // something between the two removed it. Counted per loud generation, never per event, because one
  // generation loads the view several times (vectors, lore-select and the scan itself).
  filtered(books: string[], first: ScanInput[], last: ScanInput[]) {
    if (!this.current) return;
    const runs = this.hiddenRunsFor(this.current.chatId);
    for (const book of [...runs.keys()]) if (!books.includes(book)) runs.delete(book);
    const present = (entries: ScanInput[], book: string) => entries.some((entry) => typeof entry.world === "string" && sameLorebook(book, entry.world));
    for (const book of books) {
      if (!present(first, book)) continue;
      if (present(last, book)) this.seenThisSlot.add(book);
      else this.hiddenThisSlot.add(book);
    }
  }

  settled(input: SettleInput): LoreFlag[] {
    const slot = this.current;
    this.current = null;
    this.settledSlot = null;
    if (!slot) return [];
    const loaded = this.loaded ?? [];
    this.loaded = null;
    slot.closedAt = this.now();
    slot.rendered = input.rendered;
    slot.lastMessageId = input.lastMessageId;
    const fired = firedEntries(slot.scans);
    const observed = slot.scans.some((scan) => scan.loud);
    const flags: LoreFlag[] = [];
    this.countHidden(slot.chatId);
    if (observed) {
      const outcome = forcedOutcome(slot.forced, fired);
      slot.landed = outcome.landed;
      slot.lost = outcome.lost;
      if (outcome.lost.length) flags.push({
        kind: "lore-force-lost",
        summary: `lore-force-lost: ${outcome.lost.length} of ${slot.forced.length} forced pick(s) did not reach the reply`,
        detail: summarize(outcome.lost),
        lost: outcome.lost,
      });
      if (input.story) {
        slot.constantMissed = constantMisses(input.story, input.path, loaded, fired);
        if (slot.constantMissed.length) flags.push({
          kind: "lore-constant-missed",
          summary: `lore-constant-missed: ${slot.constantMissed.length} constant gated entr${slot.constantMissed.length === 1 ? "y" : "ies"} enabled for this chat did not fire`,
          detail: summarize(slot.constantMissed),
          missed: slot.constantMissed,
        });
      }
      this.tallyMirror(input.mirrorBook, loaded, fired);
    }
    this.slots = [...this.slots, slot].slice(-LORE_EVIDENCE_LIMIT);
    this.settledSlot = slot;
    return flags;
  }

  lastSettled(): LoreSlot | null {
    return this.settledSlot;
  }

  view(story: NormalizedStoryV2 | null = null, mirrorBook: string | null = null): LoreEvidenceView {
    const slots = this.live();
    const last = slots[slots.length - 1] ?? null;
    if (!last) return { last: null, hiddenBooks: this.hiddenBooks() };
    const { scans, ...rest } = last;
    return {
      last: {
        ...rest,
        fired: firedEntries(scans, false).map((entry) => ({ ...entry, origin: classifyFired(entry, story, last.forced, mirrorBook) })),
        scanCount: scans.length,
        nestedScans: scans.filter((scan) => !scan.loud).length,
      },
      hiddenBooks: this.hiddenBooks(),
    };
  }

  slotsForChat(): LoreSlot[] {
    return this.live();
  }

  hiddenBooks(): string[] {
    return [...this.hiddenRunsFor(this.host?.chatId() ?? "")].filter(([, runs]) => runs >= HIDDEN_GENERATIONS_FOR_REPAIR).map(([book]) => book).sort();
  }

  // Mirror key hygiene, measurement only: per `so_` entry of this chat's mirror book, how many
  // observed loud generations held it enabled in the scan view, and how many of those fired it. This
  // tally is never rolled back — it measures the scanner, not the story.
  mirrorRates(): Array<{ comment: string; eligible: number; fired: number; rate: number }> {
    return [...this.mirror].map(([comment, tally]) => ({
      comment,
      ...tally,
      rate: tally.eligible ? tally.fired / tally.eligible : 0,
    })).sort((left, right) => left.comment.localeCompare(right.comment));
  }

  resetMirrorTally() {
    this.mirror.clear();
  }

  private tallyMirror(mirrorBook: string | null, loaded: LoadedCopy[], fired: ScannedEntry[]) {
    if (!mirrorBook) return;
    const firedKeys = new Set(fired.map(refKey));
    for (const copy of loaded) {
      if (copy.disable || !copy.comment.startsWith(MIRROR_COMMENT_PREFIX) || !sameLorebook(mirrorBook, copy.world)) continue;
      const tally = this.mirror.get(copy.comment) ?? { eligible: 0, fired: 0 };
      tally.eligible += 1;
      if (firedKeys.has(refKey(copy))) tally.fired += 1;
      this.mirror.set(copy.comment, tally);
    }
  }

  private hiddenRunsFor(chatId: string): Map<string, number> {
    const runs = this.hiddenRuns.get(chatId) ?? new Map<string, number>();
    this.hiddenRuns.set(chatId, runs);
    return runs;
  }

  private countHidden(chatId: string) {
    const runs = this.hiddenRunsFor(chatId);
    for (const book of this.hiddenThisSlot) runs.set(book, (runs.get(book) ?? 0) + 1);
    for (const book of this.seenThisSlot) if (!this.hiddenThisSlot.has(book)) runs.delete(book);
    this.hiddenThisSlot = new Set();
    this.seenThisSlot = new Set();
  }

  // Inv 11: a slot describes a reply, so an edit, swipe or delete at or before that reply drops it,
  // as does anything from an earlier world (a story load, a restart, a chat change).
  private live(): LoreSlot[] {
    const host = this.host;
    if (!host) return [];
    const context = host.context();
    const chatId = host.chatId() ?? "";
    this.slots = this.slots.filter((slot) => {
      if (slot.epoch !== context.sessionEpoch) return false;
      const mutated = context.lowestMutatedSince?.(slot.revision) ?? null;
      return mutated === null || mutated > (slot.lastMessageId ?? Number.POSITIVE_INFINITY);
    });
    return this.slots.filter((slot) => slot.chatId === chatId);
  }

  private now(): string {
    return this.host?.now?.() ?? new Date().toISOString();
  }
}

export const loreEvidence = new LoreEvidence();

export const loreEvidenceView = (story: NormalizedStoryV2 | null, mirrorBook: string | null): LoreEvidenceView => loreEvidence.view(story, mirrorBook);

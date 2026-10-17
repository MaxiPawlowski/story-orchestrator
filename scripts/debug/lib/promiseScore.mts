export const P1_FORMAT = 'so-p47-p1/1';
export const P2_FORMAT = 'so-p47-p2/1';
export const P6_FORMAT = 'so-p47-p6/1';
export const RECORDS_FORMAT = 'so-p47-records/1';

export const P47_FLOORS = {
  p1Precision: 0.95, p1Recall: 0.7, p1NpcAttributed: 0, p1WrongPromisee: 0, p1sExact: 1, p1sParaphraseRefused: 1,
  p1MinPromises: 60, p1MinNonPromises: 60, p2Agreement: 0.85, p2Wrong: 0, p2MinEvents: 30, p6Narrated: 0, p6MinProposals: 20, p8Increase: 0.05,
} as const;

export type ChatMessage = { speaker: string; text: string; user: boolean };
export type P1Gold = { promisee: string; messageId: number; quote: string };
export type P1Bait = { target: string; messageId: number; quote: string };
export type P1Case = { id: string; category: string; label: 'promise' | 'none'; chat: ChatMessage[]; gold: P1Gold[]; bait?: P1Bait[]; note?: string };
export type P1Set = { format: string; synthetic: boolean; player: string; story: string; cases: P1Case[] };
export type P2Seed = { key: string; promisee: string; messageId: number; quote: string; deadline?: string };
export type P2Event = { key: string; kind: string; messageId: number; quote: string };
export type P2Case = { id: string; category: string; chat: ChatMessage[]; seed: P2Seed[]; read: [number, number]; event: P2Event | null; note?: string };
export type P2Set = { format: string; synthetic: boolean; player: string; story: string; cases: P2Case[] };

export type ReadRow = { id: string; key: string | null; promisee: string; messageId: number; isUser: boolean; quote: string; span: [number, number]; conditional: boolean };
export type ReadEvent = { rowId: string; key: string | null; kind: string; messageId: number; quote: string };
export type ReadLine = { raw: string; kind: string | null; target: string | null; messageId: number | null; quote: string | null; outcome: 'accepted' | 'refused' | 'unparsed'; reason?: string };
export type CaseRead = { rows: ReadRow[]; events: ReadEvent[]; lines: ReadLine[]; seeded?: Record<string, string>; seedRefused?: Array<{ key: string; reason: string }>; rawResponse?: string };
export type CaseRecord = { id: string; read?: CaseRead; error?: string };
export type Records = { format: string; set: 'p1' | 'p2'; arm: string; plumbing: string | null; synthetic: boolean; cases: CaseRecord[] };

export type Ratio = { hits: number; of: number; rate: number | null };
const ratio = (hits: number, of: number): Ratio => ({ hits, of, rate: of ? hits / of : null });

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

const unescaped = (quote: string) => quote.replace(/\\"/g, '"');

export const exactIn = (text: string, quote: string): boolean => Boolean(quote) && (text.includes(quote) || text.includes(unescaped(quote)));

export function checkP1Set(set: P1Set): string[] {
  const problems: string[] = [];
  if (set?.format !== P1_FORMAT) return [`not ${P1_FORMAT}`];
  const ids = new Set<string>();
  for (const entry of set.cases) {
    if (ids.has(entry.id)) problems.push(`${entry.id}: duplicate id`);
    ids.add(entry.id);
    if (entry.label === 'promise' && !entry.gold.length) problems.push(`${entry.id}: promise without gold`);
    if (entry.label === 'none' && entry.gold.length) problems.push(`${entry.id}: non-promise with gold`);
    for (const gold of entry.gold) {
      const message = entry.chat[gold.messageId];
      if (!message?.user) problems.push(`${entry.id}: gold message ${gold.messageId} is not the player's`);
      else if (!message.text.includes(gold.quote)) problems.push(`${entry.id}: gold quote is not byte-exact in message ${gold.messageId}`);
    }
    for (const bait of entry.bait ?? []) if (!entry.chat[bait.messageId]?.text.includes(bait.quote)) problems.push(`${entry.id}: bait quote is not in message ${bait.messageId}`);
  }
  const promises = set.cases.reduce((sum, entry) => sum + entry.gold.length, 0);
  const none = set.cases.filter((entry) => entry.label === 'none').length;
  if (promises < P47_FLOORS.p1MinPromises) problems.push(`only ${promises} labelled promises (< ${P47_FLOORS.p1MinPromises})`);
  if (none < P47_FLOORS.p1MinNonPromises) problems.push(`only ${none} non-promise cases (< ${P47_FLOORS.p1MinNonPromises})`);
  return problems;
}

export function checkP2Set(set: P2Set): string[] {
  const problems: string[] = [];
  if (set?.format !== P2_FORMAT) return [`not ${P2_FORMAT}`];
  for (const entry of set.cases) {
    const keys = new Set(entry.seed.map((seed) => seed.key));
    for (const seed of entry.seed) {
      const message = entry.chat[seed.messageId];
      if (!message?.user || !message.text.includes(seed.quote)) problems.push(`${entry.id}: seed ${seed.key} is not the player's exact words`);
      if (seed.messageId >= entry.read[0]) problems.push(`${entry.id}: seed ${seed.key} sits inside the read window`);
    }
    if (entry.event) {
      if (!keys.has(entry.event.key)) problems.push(`${entry.id}: event names unknown key ${entry.event.key}`);
      const message = entry.chat[entry.event.messageId];
      if (!message?.text.includes(entry.event.quote)) problems.push(`${entry.id}: event quote is not byte-exact in message ${entry.event.messageId}`);
      if (entry.event.messageId < entry.read[0] || entry.event.messageId > entry.read[1]) problems.push(`${entry.id}: event outside the read window`);
    }
  }
  const events = set.cases.filter((entry) => entry.event).length;
  if (events < P47_FLOORS.p2MinEvents) problems.push(`only ${events} labelled events (< ${P47_FLOORS.p2MinEvents})`);
  for (const kind of ['kept', 'broken', 'renegotiated', 'released']) if (!set.cases.some((entry) => entry.event?.kind === kind)) problems.push(`no ${kind} event`);
  return problems;
}

type CategoryTally = { cases: number; gold: number; truePositives: number; falsePositives: number };

export function scoreP1(set: P1Set, records: Records) {
  const byId = new Map(records.cases.map((entry) => [entry.id, entry]));
  const incomplete: string[] = [];
  const categories: Record<string, CategoryTally> = {};
  let gold = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let wrongPromisee = 0;
  let npcAttributed = 0;
  let duplicates = 0;
  let conditionalStored = 0;
  let acceptedRows = 0;
  let exactRows = 0;
  let paraphrased = 0;
  let paraphraseRefused = 0;
  const misses: Array<{ id: string; kind: string; detail: string }> = [];
  for (const entry of set.cases) {
    const tally = (categories[`${entry.label}:${entry.category}`] ??= { cases: 0, gold: 0, truePositives: 0, falsePositives: 0 });
    tally.cases += 1;
    tally.gold += entry.gold.length;
    gold += entry.gold.length;
    const record = byId.get(entry.id);
    if (!record?.read) {
      incomplete.push(entry.id);
      continue;
    }
    const golds = entry.gold.map((row) => {
      const from = entry.chat[row.messageId].text.indexOf(row.quote);
      return { ...row, span: [from, from + row.quote.length] as [number, number], matched: false };
    });
    for (const row of record.read.rows) {
      acceptedRows += 1;
      const message = entry.chat[row.messageId];
      if (message?.user && message.text.includes(row.quote)) exactRows += 1;
      if (row.conditional) {
        conditionalStored += 1;
        continue;
      }
      const near = golds.filter((candidate) => candidate.messageId === row.messageId && overlaps(candidate.span, row.span));
      const hit = near.find((candidate) => candidate.promisee === row.promisee && !candidate.matched);
      if (hit) {
        hit.matched = true;
        truePositives += 1;
        tally.truePositives += 1;
        continue;
      }
      falsePositives += 1;
      tally.falsePositives += 1;
      if (near.some((candidate) => candidate.promisee === row.promisee)) {
        duplicates += 1;
        misses.push({ id: entry.id, kind: 'duplicate', detail: row.quote });
      } else if (near.length) {
        wrongPromisee += 1;
        misses.push({ id: entry.id, kind: 'wrong-promisee', detail: `${row.promisee}: ${row.quote}` });
      } else misses.push({ id: entry.id, kind: 'false-positive', detail: `${row.promisee}: ${row.quote}` });
      if (entry.category === 'npc-promise' || !message?.user) npcAttributed += 1;
    }
    for (const missed of golds.filter((candidate) => !candidate.matched)) misses.push({ id: entry.id, kind: 'missed', detail: `${missed.promisee}: ${missed.quote}` });
    for (const line of record.read.lines) {
      if (line.kind !== 'promised' || line.messageId === null || line.quote === null) continue;
      const message = entry.chat[line.messageId];
      if (message && exactIn(message.text, line.quote)) continue;
      paraphrased += 1;
      if (line.outcome !== 'accepted') paraphraseRefused += 1;
    }
  }
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, gold);
  const exact = ratio(exactRows, acceptedRows);
  const paraphrase = ratio(paraphraseRefused, paraphrased);
  const floors = {
    precision: precision.rate === null ? null : precision.rate >= P47_FLOORS.p1Precision,
    recall: recall.rate === null ? null : recall.rate >= P47_FLOORS.p1Recall,
    npcAttributed: npcAttributed <= P47_FLOORS.p1NpcAttributed,
    wrongPromisee: wrongPromisee <= P47_FLOORS.p1WrongPromisee,
    p1sExact: exact.rate === null ? null : exact.rate >= P47_FLOORS.p1sExact,
    p1sParaphraseRefused: paraphrase.rate === null ? null : paraphrase.rate >= P47_FLOORS.p1sParaphraseRefused,
  };
  const verdict = incomplete.length ? 'incomplete' : Object.values(floors).some((value) => value === false) ? 'fail' : 'pass';
  return {
    plan: 'v2.8 47 P1/P1s', set: 'p1', arm: records.arm, plumbing: records.plumbing, synthetic: set.synthetic && records.synthetic,
    counts: { cases: set.cases.length, gold, nonPromiseCases: set.cases.filter((entry) => entry.label === 'none').length, acceptedRows, conditionalStored, duplicates },
    precision, recall, npcAttributed, wrongPromisee, p1sExact: exact, p1sParaphraseRefused: paraphrase,
    floors, verdict, incomplete, categories, misses,
  };
}

export function scoreP2(set: P2Set, records: Records) {
  const byId = new Map(records.cases.map((entry) => [entry.id, entry]));
  const incomplete: string[] = [];
  const kinds: Record<string, { events: number; agreed: number }> = {};
  let eventCases = 0;
  let agreed = 0;
  let wrongOnEvents = 0;
  let wrongOnControls = 0;
  let kindMismatch = 0;
  let missed = 0;
  let extra = 0;
  const misses: Array<{ id: string; kind: string; detail: string }> = [];
  for (const entry of set.cases) {
    const record = byId.get(entry.id);
    if (!record?.read || record.read.seedRefused?.length) {
      incomplete.push(entry.id);
      continue;
    }
    const events = record.read.events;
    if (!entry.event) {
      wrongOnControls += events.length;
      for (const event of events) misses.push({ id: entry.id, kind: 'event-on-control', detail: `${event.kind} ${event.key ?? event.rowId}` });
      continue;
    }
    eventCases += 1;
    const tally = (kinds[entry.event.kind] ??= { events: 0, agreed: 0 });
    tally.events += 1;
    const label = entry.event;
    const wrong = events.filter((event) => event.key !== label.key);
    wrongOnEvents += wrong.length;
    for (const event of wrong) misses.push({ id: entry.id, kind: 'wrong-promise', detail: `${event.kind} ${event.key ?? event.rowId} (labelled ${label.key})` });
    const right = events.filter((event) => event.key === label.key);
    if (!right.length) {
      missed += 1;
      misses.push({ id: entry.id, kind: 'missed', detail: `${label.kind} ${label.key}` });
    } else if (!right.some((event) => event.kind === label.kind)) {
      kindMismatch += 1;
      misses.push({ id: entry.id, kind: 'kind-mismatch', detail: `${right.map((event) => event.kind).join(',')} (labelled ${label.kind})` });
    }
    if (right.length > 1) extra += right.length - 1;
    if (events.length === 1 && events[0].key === label.key && events[0].kind === label.kind) {
      agreed += 1;
      tally.agreed += 1;
    }
  }
  const agreement = ratio(agreed, eventCases);
  const wrongPromise = wrongOnEvents + wrongOnControls;
  const floors = {
    agreement: agreement.rate === null ? null : agreement.rate >= P47_FLOORS.p2Agreement,
    p2w: wrongPromise <= P47_FLOORS.p2Wrong,
    events: eventCases >= P47_FLOORS.p2MinEvents,
  };
  const verdict = incomplete.length ? 'incomplete' : Object.values(floors).some((value) => value === false) ? 'fail' : 'pass';
  return {
    plan: 'v2.8 47 P2/P2w', set: 'p2', arm: records.arm, plumbing: records.plumbing, synthetic: set.synthetic && records.synthetic,
    counts: { cases: set.cases.length, eventCases, controls: set.cases.filter((entry) => !entry.event).length, missed, kindMismatch, extra },
    agreement, p2w: { total: wrongPromise, onEventCases: wrongOnEvents, onControls: wrongOnControls },
    floors, verdict, incomplete, kinds, misses,
  };
}

export type P8Window = { id: string; on: number; off: number };

export function scoreP8(windows: readonly P8Window[]) {
  const on = windows.reduce((sum, entry) => sum + entry.on, 0);
  const off = windows.reduce((sum, entry) => sum + entry.off, 0);
  const each = windows.filter((entry) => entry.off > 0).map((entry) => ({ id: entry.id, increase: entry.on / entry.off - 1 }));
  const increase = off ? on / off - 1 : null;
  const worst = each.reduce<{ id: string; increase: number } | null>((max, entry) => (!max || entry.increase > max.increase ? entry : max), null);
  return {
    plan: 'v2.8 47 P8 (joins 42 RB)', windows: windows.length, tokens: { on, off, added: on - off }, increase, worst,
    floor: P47_FLOORS.p8Increase, pass: increase === null ? null : increase <= P47_FLOORS.p8Increase,
  };
}

export type P6Proposal = {
  id: string; error?: string;
  fields?: { name: string; objective: string; rubrics: string[]; chapterTitle: string | null };
  guard?: string[];
  rater?: { narrates: boolean; kind: string; evidence?: string } | null;
};

export function scoreP6(proposals: readonly P6Proposal[]) {
  const usable = proposals.filter((entry) => entry.fields && !entry.error);
  const guardHits = usable.filter((entry) => (entry.guard ?? []).length).map((entry) => entry.id);
  const rated = usable.filter((entry) => entry.rater);
  const raterHits = rated.filter((entry) => entry.rater?.narrates).map((entry) => entry.id);
  const narrated = [...new Set([...guardHits, ...raterHits])].sort();
  const unrated = usable.filter((entry) => !entry.rater).map((entry) => entry.id);
  const errors = proposals.filter((entry) => !entry.fields || entry.error).map((entry) => entry.id);
  const complete = usable.length >= P47_FLOORS.p6MinProposals && !unrated.length;
  return {
    plan: 'v2.8 47 P6', proposals: proposals.length, usable: usable.length, errors, unrated,
    guardHits, raterHits, narrated: narrated.length, narratedIds: narrated,
    floor: P47_FLOORS.p6Narrated, verdict: !complete ? 'incomplete' : narrated.length <= P47_FLOORS.p6Narrated ? 'pass' : 'fail',
  };
}

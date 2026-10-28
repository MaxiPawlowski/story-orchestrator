import { revisionOf, witnessInputRange, type WitnessWindowMessage } from "./contract";
import type { HeardList, WitnessAudit, WitnessClaim, WitnessSpanClaim } from "./types";

export interface DeriveMember {
  id: string;
  names: readonly string[];
  omniscient: boolean;
}

export interface DeriveMessage extends WitnessWindowMessage {
  speaker: string | null;
  present?: readonly string[];
}

export interface DeriveOptions {
  stage: "enabled" | "appeared";
  omniscient: "speaker-only" | "always";
  mention: boolean;
  lookahead: boolean;
  asides: boolean;
}

export const DERIVE_DEFAULTS: DeriveOptions = { stage: "appeared", omniscient: "speaker-only", mention: true, lookahead: true, asides: true };

export interface DeriveInput {
  from: number;
  to: number;
  messages: readonly DeriveMessage[];
  members: readonly DeriveMember[];
  enabled: readonly string[];
}

const CUES = [
  /\bwhisper(?:s|ed|ing)?\b/i,
  /\bmurmur(?:s|ed|ing)?\b/i,
  /\bmutter(?:s|ed|ing)?\b/i,
  /\bunder (?:his|her|their|my|your) breath\b/i,
  /\b(?:voice|tone) (?:low|lowered|dropped|hushed)\b/i,
  /\b(?:keeps?|keeping|kept) (?:his|her|their|my|your) voice low\b/i,
  /\bbarely (?:audible|above a (?:breath|whisper))\b/i,
  /\btoo low for\b/i,
  /\bso (?:that )?only\b[^.!?]{0,40}\bcan hear\b/i,
  /\bout of (?:the others'|everyone's|anyone's) (?:hearing|earshot)\b/i,
  /\b(?:takes?|took|pulls?|pulled|draws?|drew) [A-Z][\w'-]* aside\b/,
  /\b[A-Z][\w'-]*'s ear\b/,
  /\b(?:to|for) [A-Z][\w'-]* alone\b/,
  /\b(?:to|for) the [a-z]+ alone\b/i,
];

const ADDRESSEE = [
  /\b(?:to|toward|towards|at)\s+(?:the\s+)?([A-Z][\w'-]*)/g,
  /\b([A-Z][\w'-]*)'s\s+ear\b/g,
  /\b(?:takes?|took|pulls?|pulled|draws?|drew)\s+([A-Z][\w'-]*)\s+aside\b/g,
  /\b(?:to|for)\s+([A-Z][\w'-]*)\s+alone\b/g,
  /\bonly\s+([A-Z][\w'-]*)\s+can hear\b/g,
];

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function nameIndex(members: readonly DeriveMember[]): Map<string, string> {
  const owners = new Map<string, Set<string>>();
  const add = (token: string, id: string) => {
    const key = token.trim();
    if (key.length < 3 || !/^[A-Z]/.test(key)) return;
    (owners.get(key) ?? owners.set(key, new Set()).get(key) as Set<string>).add(id);
  };
  members.forEach((member) => member.names.forEach((name) => {
    add(name, member.id);
    name.split(/\s+/).forEach((part) => add(part, member.id));
  }));
  return new Map([...owners].filter(([, ids]) => ids.size === 1).map(([token, ids]) => [token, [...ids][0]]));
}

const named = (text: string, index: ReadonlyMap<string, string>): Set<string> => {
  const found = new Set<string>();
  index.forEach((id, token) => { if (new RegExp(`\\b${escape(token)}\\b`).test(text)) found.add(id); });
  return found;
};

export function sentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const end = /[.!?…]+["”*)\]]*\s+|\n+/g;
  let start = 0;
  for (let match = end.exec(text); match; match = end.exec(text)) {
    const stop = match.index + match[0].length;
    if (text.slice(start, stop).trim()) spans.push([start, stop]);
    start = stop;
  }
  if (text.slice(start).trim()) spans.push([start, text.length]);
  return spans.length ? spans : [[0, text.length]];
}

export const hasAsideCue = (text: string): boolean => CUES.some((cue) => cue.test(text));

const addressees = (text: string, index: ReadonlyMap<string, string>): Set<string> => {
  const found = new Set<string>();
  ADDRESSEE.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const id = index.get(match[1]);
      if (id) found.add(id);
    }
  });
  return found;
};

const members = (ids: Iterable<string>, order: readonly DeriveMember[]): HeardList => {
  const set = new Set(ids);
  return { kind: "members", members: order.filter((member) => set.has(member.id)).map((member) => member.id) };
};

interface Cast {
  index: ReadonlyMap<string, string>;
  order: readonly DeriveMember[];
  listeners: readonly string[];
  always: readonly string[];
}

const sameHeard = (left: HeardList, right: HeardList): boolean => JSON.stringify(left) === JSON.stringify(right);

const mergeSpans = (spans: readonly WitnessSpanClaim[]): WitnessSpanClaim[] => spans.reduce<WitnessSpanClaim[]>((out, span) => {
  const last = out.at(-1);
  if (last && sameHeard(last.heard, span.heard)) last.span = [last.span[0], span.span[1]];
  else out.push({ span: [span.span[0], span.span[1]], heard: span.heard });
  return out;
}, []);

function claimOf(row: DeriveMessage, speaker: readonly string[], stage: ReadonlySet<string>, cast: Cast, asides: boolean): WitnessClaim {
  const base = { messageId: row.messageId, revision: revisionOf(row) };
  const sentences = sentenceSpans(row.text);
  const cued = asides ? sentences.filter(([start, stop]) => hasAsideCue(row.text.slice(start, stop))) : [];
  if (!cued.length) return { ...base, mixed: false, heard: members(stage, cast.order), spans: [] };
  const aside = (start: number, stop: number) => new Set([...speaker, ...cast.always,
    ...[...addressees(row.text.slice(start, stop), cast.index)].filter((id) => cast.listeners.includes(id))]);
  if (cued[0][0] === sentences[0][0]) {
    return { ...base, mixed: false, heard: members(cued.flatMap(([start, stop]) => [...aside(start, stop)]), cast.order), spans: [] };
  }
  const isCued = (start: number) => cued.some(([from]) => from === start);
  const spans = mergeSpans(sentences.map(([start, stop]) => ({ span: [start, stop], heard: members(isCued(start) ? aside(start, stop) : stage, cast.order) })));
  if (spans.length === 1) return { ...base, mixed: false, heard: spans[0].heard, spans: [] };
  spans[0].span = [0, spans[0].span[1]];
  return { ...base, mixed: true, heard: { kind: "unknown" }, spans };
}

export function deriveWitnessClaims(input: DeriveInput, options: DeriveOptions = DERIVE_DEFAULTS): WitnessClaim[] {
  const byId = new Map(input.members.map((member) => [member.id, member]));
  const enabled = new Set(input.enabled.filter((id) => byId.has(id)));
  const cast: Cast = {
    index: nameIndex(input.members),
    order: input.members,
    listeners: input.members.filter((member) => !member.omniscient && enabled.has(member.id)).map((member) => member.id),
    always: options.omniscient === "always" ? input.members.filter((member) => member.omniscient && enabled.has(member.id)).map((member) => member.id) : [],
  };
  const rows = [...input.messages].sort((left, right) => left.messageId - right.messageId);
  const speakerOf = (row: DeriveMessage): string[] => (row.speaker && byId.has(row.speaker) ? [row.speaker] : []);
  const seen = rows.map((row) => [...speakerOf(row), ...(options.mention ? named(row.text, cast.index) : [])]);
  const last = rows.reduce((found, entry, at) => (entry.messageId <= input.to ? at : found), -1);
  return rows.flatMap((row, at) => {
    if (row.messageId < input.from || row.messageId > input.to) return [];
    const appeared = new Set(seen.slice(0, (options.lookahead ? last : at) + 1).flat());
    const onStage = (id: string) => (row.present ? row.present.includes(id) : options.stage === "enabled" || appeared.has(id));
    const speaker = speakerOf(row);
    return [claimOf(row, speaker, new Set([...cast.listeners.filter(onStage), ...speaker, ...cast.always]), cast, options.asides)];
  });
}

export function deriveWitnessAudit(input: DeriveInput, options: DeriveOptions = DERIVE_DEFAULTS): WitnessAudit {
  const window = input.messages.filter((message) => message.messageId >= input.from && message.messageId <= input.to);
  return { status: "accepted", inputRange: witnessInputRange({ from: input.from, to: input.to, messages: window }), claims: deriveWitnessClaims(input, options) };
}

export interface ReadRosterMember {
  id: string;
  name?: string;
  aliases?: readonly string[];
  view?: string;
}

export interface ReadWindowMessage {
  messageId: number;
  speaker: string;
  text: string;
  isUser: boolean;
  swipeId?: number;
}

export function deriveFromRead(
  roster: readonly ReadRosterMember[], enabled: readonly string[], window: { from: number; to: number; messages: readonly ReadWindowMessage[] }, context: readonly ReadWindowMessage[] = [],
): WitnessAudit {
  const members = roster.map((member) => ({ id: member.id, names: [member.name ?? member.id, ...(member.aliases ?? [])], omniscient: member.view === "omniscient" }));
  const speakerOf = (message: ReadWindowMessage): string | null => {
    if (message.isUser) return null;
    const key = message.speaker.trim().toLowerCase();
    return roster.find((member) => [member.id, member.name ?? "", ...(member.aliases ?? [])].some((name) => name.trim().toLowerCase() === key))?.id ?? null;
  };
  const rows = [...context.filter((message) => message.messageId < window.from), ...window.messages]
    .map((message) => ({ messageId: message.messageId, text: message.text, swipeId: message.swipeId, speaker: speakerOf(message) }));
  return deriveWitnessAudit({ from: window.from, to: window.to, messages: rows, members, enabled });
}

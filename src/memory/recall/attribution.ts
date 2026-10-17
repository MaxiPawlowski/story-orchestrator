import type { SourceSpan } from "../audience";

export interface RecallSpeaker {
  name: string;
  aliases?: string[];
}

export interface AttributionInput {
  source: SourceSpan;
  messageText: string;
  candidateText: string;
  roster: readonly RecallSpeaker[];
  playerName: string;
}

export type AttributionRefusal = "empty span" | "altered quote" | "speaker not in roster" | "spans quote marks" | "multi-speaker" | "tagged to another speaker" | "narration";

export type Attribution = { ok: true; speaker: string; quote: string; line: string } | { ok: false; reason: AttributionRefusal };

const QUOTED = /"([^"\n]*)"|“([^”\n]*)”/g;
const QUOTE_MARK = /["“”]/;
const ACTION = /\*[^*\n]+\*/g;
const VERBS = ["said|says|asked|asks|whispered|whispers|murmured|murmurs|replied|replies|answered|answers|added|adds",
  "muttered|mutters|called|calls|shouted|shouts|snapped|snaps|told|tells|hissed|hisses"].join("|");
const TAG_REACH = 48;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Segment {
  start: number;
  end: number;
}

const segmentsOf = (text: string): Segment[] => [...text.matchAll(QUOTED)].map((match) => ({ start: (match.index ?? 0) + 1, end: (match.index ?? 0) + match[0].length - 1 }));

const actionsOf = (text: string): Segment[] => [...text.matchAll(ACTION)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));

const lastClause = (text: string): string => text.slice(Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?")) + 1);

const tagged = (names: ReadonlyMap<string, string>, before: string, after: string): string[] => [...names].flatMap(([alias, name]) => {
  const who = escape(alias);
  const follows = new RegExp(`^[\\s,.!?—-]*(?:${who}\\s+(?:${VERBS})|(?:${VERBS})\\s+${who})\\b`, "i").test(after);
  const leads = new RegExp(`\\b${who}\\s+(?:${VERBS})\\b[^"“”]*$`, "i").test(lastClause(before));
  return follows || leads ? [name] : [];
});

const tagsOf = (text: string, segments: readonly Segment[], names: ReadonlyMap<string, string>): Set<string> => {
  if (!segments.length) return new Set([...names].filter(([alias]) => new RegExp(`\\b${escape(alias)}\\s+(?:${VERBS})\\b`, "i").test(text)).map(([, name]) => name));
  return new Set(segments.flatMap((segment, index) => tagged(names, text.slice(index ? segments[index - 1].end + 1 : 0, segment.start - 1), text.slice(segment.end + 1, segment.end + 1 + TAG_REACH))));
};

const namesOf = (roster: readonly RecallSpeaker[], playerName: string): Map<string, string> =>
  new Map([...roster.flatMap((member) => [member.name, ...(member.aliases ?? [])].map((alias) => [alias, member.name] as const)), [playerName, playerName] as const]);

const speakerOf = (input: AttributionInput): string | null =>
  (input.source.isUser ? input.playerName : input.roster.find((member) => member.name === input.source.speaker || member.aliases?.includes(input.source.speaker))?.name ?? null);

const overlaps = (span: readonly [number, number], segment: Segment): boolean => span[0] < segment.end && span[1] > segment.start;

const names = (text: string, name: string): boolean => new RegExp(`\\b${escape(name)}\\b`, "i").test(text);

function refusal(input: AttributionInput, speaker: string, quote: string): AttributionRefusal | null {
  const { messageText: text, source: { span } } = input;
  const segments = segmentsOf(text);
  const tags = tagsOf(text, segments, namesOf(input.roster, input.playerName));
  if (tags.size > 1) return "multi-speaker";
  if ([...tags].some((name) => name !== speaker)) return "tagged to another speaker";
  if (segments.length) return segments.some((segment) => span[0] >= segment.start && span[1] <= segment.end) ? null : "narration";
  if (actionsOf(text).some((segment) => overlaps(span, segment))) return "narration";
  return names(quote, speaker) ? "narration" : null;
}

export function attributeSpan(input: AttributionInput): Attribution {
  const quote = input.messageText.slice(input.source.span[0], input.source.span[1]);
  if (!quote.trim()) return { ok: false, reason: "empty span" };
  if (quote !== input.candidateText) return { ok: false, reason: "altered quote" };
  const speaker = speakerOf(input);
  if (!speaker) return { ok: false, reason: "speaker not in roster" };
  if (QUOTE_MARK.test(quote)) return { ok: false, reason: "spans quote marks" };
  const refused = refusal(input, speaker, quote);
  if (refused) return { ok: false, reason: refused };
  const line = `${speaker} said: "${quote}"`;
  return line.slice(speaker.length + 8, -1) === quote ? { ok: true, speaker, quote, line } : { ok: false, reason: "altered quote" };
}

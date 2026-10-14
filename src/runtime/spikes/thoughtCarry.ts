import { isMetaCommentary } from "@memory/innerRender";
import type { CarryInput, CarryResult } from "../spikeSeams";

export const CARRY_WINDOW = 8;
export const CARRY_MIN_CHARS = 12;
export const CARRY_MAX_CHARS = 200;
export const CARRY_LABEL = "(carried from your last thought)";

export type CarryReason = "off" | "no-reply" | "no-reasoning" | "no-aim";

export interface ThoughtCarryStats {
  asked: number;
  carried: number;
  off: number;
  noReply: number;
  noReasoning: number;
  noAim: number;
}

type Row = { name?: unknown; is_user?: boolean; is_system?: boolean; extra?: { reasoning?: unknown } } | null | undefined;

const WRITING = new RegExp([
  "\\bwrit(e|es|ing|ten)\\b", "\\bnarrat", "\\bdescrib", "\\bparagraphs?\\b", "\\btone\\b", "\\brepl(y|ies)\\b", "\\brespon(se|d|ds)\\b",
  "\\bscene\\b", "\\bportray", "\\bdepict", "\\bdialogue\\b", "\\bprose\\b", "\\bpersona\\b", "\\bnpcs?\\b", "\\bin[- ]character\\b",
  "\\bpersonality\\b", "\\btraits?\\b", "\\bthe user\\b", "\\bthe (story|narrative|plot)\\b", "\\bstop where\\b", "\\b(third|first|second) person\\b",
  "\\bsensory\\b", "\\bthe reader\\b", "\\bthe prompt\\b", "\\bsystem\\b",
].join("|"), "i");

const AIM_NOUN = "(?:goals?|aims?|wants?|desires?|motivations?|objectives?|intentions?|drives?|priorit(?:y|ies))";
const AIM_VERB = "(?:wants?|needs? to|intends?|plans? to|hopes? to|is determined to|is trying to|longs? to|aims? to|is desperate to|resolves? to|means to|is set on|wishes? to|refuses to)";
const ADVERB = "(?:(?:still|now|really|desperately|clearly|just|also|only|mostly|badly|secretly)\\s+)?";

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const subjects = (name: string): string => {
  const lower = name.trim().toLowerCase();
  const first = lower.split(/\s+/)[0] ?? "";
  const named = [...new Set([lower, ...(first.length >= 3 ? [first] : [])])].filter(Boolean).map(escape);
  return `(?:${[...named, "he", "she", "they", "i"].join("|")})`;
};

const clean = (line: string) => line.replace(/\*\*|__|`/g, "").replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, "").trim();

const sentences = (text: string) => text.split(/\n+/).map(clean).filter(Boolean)
  .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"“])/).map((part) => part.trim()).filter(Boolean));

const clip = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= CARRY_MAX_CHARS) return flat;
  const cut = flat.slice(0, CARRY_MAX_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), CARRY_MIN_CHARS)).trim()}…`;
};

const usable = (text: string, players: string[]) => {
  const lower = text.toLowerCase();
  if (text.length < CARRY_MIN_CHARS || isMetaCommentary(text) || WRITING.test(text)) return false;
  return !players.some((player) => player && lower.startsWith(player.toLowerCase()));
};

export const aimsIn = (reasoning: string, name: string, players: string[]): string[] => {
  const who = subjects(name);
  const label = new RegExp(`^(?:(?:${who})'s\\s+|his\\s+|her\\s+|their\\s+|my\\s+)?${AIM_NOUN}\\s*(?:\\([^)]*\\))?\\s*:\\s*(.+)$`, "i");
  const verb = new RegExp(`^${who}\\s+${ADVERB}${AIM_VERB}\\b`, "i");
  const owned = new RegExp(`^${who}'s\\s+(?:goal|aim|plan|desire|intention|priority)\\s+(?:is|remains|was)\\b`, "i");
  const lines = reasoning.split(/\n+/).map(clean).filter(Boolean);
  const labelled = lines.map((line) => label.exec(line)?.[1]?.trim() ?? "").filter((aim) => usable(aim, players));
  const stated = sentences(reasoning).filter((sentence) => (verb.test(sentence) || owned.test(sentence)) && usable(sentence, players));
  return [...labelled, ...stated.reverse()].map(clip);
};

const ownReply = (input: CarryInput): { row: Row; at: number } | null => {
  const rows = input.rows as Row[];
  const newest = rows.length - 1;
  const floor = Math.max(0, input.from, newest - CARRY_WINDOW);
  for (let at = newest; at >= floor; at -= 1) {
    const row = rows[at];
    if (!row || row.is_user || row.is_system || row.name !== input.name) continue;
    if (at === newest) continue;
    return { row, at };
  }
  return null;
};

export const pickCarry = (input: CarryInput): CarryResult => {
  const found = ownReply(input);
  if (!found) return { line: "", reason: "no-reply" };
  const reasoning = found.row?.extra?.reasoning;
  if (typeof reasoning !== "string" || !reasoning.trim()) return { line: "", reason: "no-reasoning", messageId: found.at };
  const users = (input.rows as Row[]).filter((row) => row?.is_user && typeof row.name === "string").map((row) => String(row?.name));
  const aim = aimsIn(reasoning, input.name, [...new Set([...input.players, ...users])])[0];
  return aim ? { line: `${CARRY_LABEL} ${aim}`, messageId: found.at } : { line: "", reason: "no-aim", messageId: found.at };
};

const COUNTER: Record<CarryReason, keyof ThoughtCarryStats> = { off: "off", "no-reply": "noReply", "no-reasoning": "noReasoning", "no-aim": "noAim" };

export class ThoughtCarry {
  readonly stats: ThoughtCarryStats = { asked: 0, carried: 0, off: 0, noReply: 0, noReasoning: 0, noAim: 0 };

  constructor(private readonly enabled: () => boolean) {}

  carry(input: CarryInput): CarryResult {
    this.stats.asked += 1;
    const result: CarryResult = this.enabled() ? pickCarry(input) : { line: "", reason: "off" };
    if (result.line) this.stats.carried += 1;
    else this.stats[COUNTER[(result.reason ?? "no-aim") as CarryReason]] += 1;
    return result;
  }
}

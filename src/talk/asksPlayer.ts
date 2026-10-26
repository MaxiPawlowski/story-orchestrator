const QUOTED = /"([^"]*)"|“([^”]*)”/g;
const NARRATION = /\*[^*]*\*/g;
const SECOND_PERSON = /\b(?:you|your|yours|yourself|yourselves)\b/i;
const QUESTION_END = /\?[\s)\]'"’”]*$/;
export const ASK_TAIL_LIMIT = 200;

export interface AskContext {
  player: readonly string[];
  others: readonly string[];
}

const escapeWord = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const wordsOf = (names: readonly string[]): string[] =>
  [...new Set(names.flatMap((name) => name.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter((word) => word.length > 2))];

const names = (text: string, words: readonly string[]): boolean =>
  words.some((word) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeWord(word)}(?![\\p{L}\\p{N}])`, "iu").test(text));

const lastSentence = (text: string): string => text.trim().split(/(?<=[.!?])\s+/).at(-1) ?? "";

const addressed = (line: string, around: string, player: readonly string[], others: readonly string[]): boolean => {
  if (!QUESTION_END.test(line.trim()) || names(line, others)) return false;
  if (names(line, player) || names(around, player)) return true;
  return SECOND_PERSON.test(line) && !names(around, others);
};

export const asksPlayer = (text: string, context: AskContext): boolean => {
  const plain = text.replace(/[‘’]/g, "'").trim();
  const player = wordsOf(context.player);
  const others = wordsOf(context.others).filter((word) => !player.includes(word));
  if (!plain || !player.length) return false;
  const quoted = [...plain.matchAll(QUOTED)];
  const last = quoted.at(-1);
  if (!last) return addressed(lastSentence(plain.replace(NARRATION, " ")), "", player, others);
  const tail = plain.slice((last.index ?? 0) + last[0].length);
  if (tail.length > ASK_TAIL_LIMIT || tail.includes("?")) return false;
  return addressed(last[1] ?? last[2] ?? "", tail, player, others);
};

interface AskMember {
  id: string;
  name?: string;
  aliases?: string[];
}

export const lastReplyAsksPlayer = (roster: readonly AskMember[], control: { chain?: { yield_on_question?: boolean } | false } | null, chat: readonly unknown[], player: string): boolean => {
  if (control?.chain && control.chain.yield_on_question === false) return false;
  const last = chat.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object").reverse().find((row) => row.is_system !== true);
  if (!last || last.is_user === true || typeof last.mes !== "string") return false;
  const speaker = String(last.name ?? "").trim().toLowerCase();
  const others = roster.filter((member) => (member.name ?? member.id).trim().toLowerCase() !== speaker)
    .flatMap((member) => [member.name ?? member.id, ...(member.aliases ?? [])]);
  return asksPlayer(last.mes, { player: [player], others });
};

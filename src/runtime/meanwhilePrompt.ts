import { PLAYER_REF, agendaStepKey, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";

export const MEANWHILE_TEXT_MAX = 200;
const LINE = /^MEANWHILE:\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/;
const NARRATES_PLAYER = /\b(?:you|your|yours|the player)\b/i;

export interface ParsedMeanwhile {
  memberId: string;
  agendaId: string;
  text: string;
}

export interface MeanwhileParse {
  proposals: ParsedMeanwhile[];
  refused: Array<{ line: string; reason: string }>;
}

interface WindowLine { speaker: string; text: string }

const openAgendas = (story: NormalizedStoryV2, values: Readonly<Record<string, PrimitiveValue>>) => (story.life?.members ?? []).flatMap((member) =>
  member.agenda.map((agenda) => {
    const done = Math.min(agenda.steps.length, Number(values[agendaStepKey(member.id, agenda.id)] ?? 0));
    return { member, agenda, done: agenda.steps.slice(0, done).map((step) => step.text), next: agenda.steps[done]?.text ?? null };
  }));

export const buildMeanwhilePrompt = (story: NormalizedStoryV2, values: Readonly<Record<string, PrimitiveValue>>, window: readonly WindowLine[]): string => {
  const agendas = openAgendas(story, values).map(({ member, agenda, done, next }) => [
    `- ${member.id} | ${agenda.id} | goal: ${agenda.goal}`,
    ...(done.length ? [`  done so far: ${done.join("; ")}`] : []),
    ...(next ? [`  the author's next step: ${next}`] : []),
  ].join("\n"));
  return [
    `You suggest what characters of the story "${story.title}" did off stage, between scenes, for an author to review.`,
    "Rules: one short sentence per character at most; it must serve that agenda's goal and nothing else; never say what the player character does, says, "
      + "thinks or decides; never name a person, place or event that is not in the agenda or the recent chat; it changes nothing by itself.",
    "Agendas:",
    ...agendas,
    "Recent chat:",
    ...window.map((line) => `${line.speaker}: ${line.text}`),
    "Answer with lines `MEANWHILE: <member id> | <agenda id> | <sentence>`, or the single word NONE.",
  ].join("\n");
};

const refuseText = (text: string): string | null => {
  if (text.length > MEANWHILE_TEXT_MAX) return `longer than ${MEANWHILE_TEXT_MAX} characters`;
  if (text.includes(PLAYER_REF) || NARRATES_PLAYER.test(text)) return "narrates the player";
  return null;
};

export const parseMeanwhile = (reply: string, story: NormalizedStoryV2): MeanwhileParse => {
  const proposals: ParsedMeanwhile[] = [];
  const refused: MeanwhileParse["refused"] = [];
  for (const raw of reply.split("\n").map((line) => line.trim()).filter(Boolean)) {
    if (/^NONE$/i.test(raw)) continue;
    const match = raw.match(LINE);
    if (!match) {
      refused.push({ line: raw, reason: "not a MEANWHILE line" });
      continue;
    }
    const [, memberId, agendaId, text] = match;
    const member = story.life?.members.find((entry) => entry.id === memberId);
    const reason = !member ? "no such member" : !member.agenda.some((agenda) => agenda.id === agendaId) ? "no such agenda" : refuseText(text)
      ?? (proposals.some((entry) => entry.memberId === memberId) ? "a second event for one member" : null);
    if (reason) refused.push({ line: raw, reason });
    else proposals.push({ memberId, agendaId, text });
  }
  return { proposals, refused };
};

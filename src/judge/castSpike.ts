import { choice, choiceAnswer } from "./questions";
import type { SpikeAnswers, SpikeCall, SpikeRow, SpikeVerdict } from "./ideaSpikes";

export const CAST_USES = ["under", "over", "fine"] as const;
export type CastUse = (typeof CAST_USES)[number];
export interface CastBalanceRow {
  id: string;
  player: string;
  cast: Array<{ name: string; role: string }>;
  turns: Array<{ speaker: string; text: string }>;
  labels: Record<string, CastUse>;
}

const castOptions = (name: string) => ({
  under: `${name} speaks less than the scene needs: they are addressed, or their role is needed, and they stay silent or others answer for them`,
  over: `${name} speaks more than the scene needs: answering what was put to others, crowding the scene, or talking where their role gives no reason`,
  fine: `${name} speaks about as much as the scene needs`,
});

export const castCalls = (rows: CastBalanceRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: {
    state: { player: row.player, cast: row.cast, turns: row.turns.map((line, index) => ({ id: `turn_${index + 1}`, speaker: line.speaker, text: line.text })) },
    questions: Object.fromEntries(row.cast.map((member) => [
      `use:${member.name}`, choice(`In \`turns\`, is ${member.name} speaking as much as the scene needs, given their role in \`cast\`?`, castOptions(member.name)),
    ])),
  },
}));

const castShareBaseline = (row: CastBalanceRow, name: string): CastUse => {
  const spoken = row.turns.filter((turn) => turn.speaker !== row.player);
  const expected = spoken.length / Math.max(1, row.cast.length);
  const count = spoken.filter((turn) => turn.speaker === name).length;
  return count < expected * 0.5 ? "under" : count > expected * 1.75 ? "over" : "fine";
};

export function scoreCastBalance(rows: CastBalanceRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.flatMap((row) => row.cast.map((member): SpikeRow => {
    const found = answers.get(row.id)?.answers;
    const answer = found ? choiceAnswer(found, `use:${member.name}`) : null;
    const label = row.labels[member.name];
    return { id: `${row.id}.${member.name}`, label, read: answer ? `${answer.choice}@${Number(answer.confidence.toFixed(3))}` : null, right: answer?.choice === label, family: label };
  }));
  const rate = (items: SpikeRow[]) => items.length ? Number((items.filter((row) => row.right).length / items.length).toFixed(4)) : null;
  const baseline = rows.flatMap((row) => row.cast.map((member) => castShareBaseline(row, member.name) === row.labels[member.name]));
  const metrics = { agreement: rate(scored), shareBaseline: Number((baseline.filter(Boolean).length / baseline.length).toFixed(4)),
    ...Object.fromEntries(CAST_USES.map((use) => [use, rate(scored.filter((row) => row.label === use))])) };
  const ok = metrics.agreement !== null && metrics.agreement >= 0.85;
  const unanswered = scored.filter((row) => row.read === null).length;
  return { idea: "castBalance", rows: scored, metrics, floors: [{ name: "agreement", value: metrics.agreement, floor: 0.85, op: ">=", ok }], passed: ok && !unanswered, unanswered };
}

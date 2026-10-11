import { score, scoreAnswer } from "./questions";
import type { SpikeAnswers, SpikeCall, SpikeVerdict } from "./ideaSpikes";

export interface ToneRow { id: string; intent: string; reply: string; level: number }

export const toneCalls = (rows: ToneRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: { state: { intent: row.intent,
     reply: row.reply },
     questions: { tone: score("How well does `reply` match the tone and themes of `intent`?",
     ["opposes the intent",
     "mostly at odds with the intent",
     "mixed or neutral",
     "mostly matches the intent",
     "fully matches the intent"]) } },
    
}));

export function scoreTone(rows: ToneRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.map((row) => {
    const found = answers.get(row.id)?.answers;
    const value = found ? scoreAnswer(found, "tone")?.score ?? null : null;
    return { id: row.id, label: String(row.level), read: value === null ? null : `score=${value}`, right: value !== null && Math.abs(value - row.level) <= 1 };
  });
  const value = scored.length ? scored.filter((row) => row.right).length / scored.length : null;
  const unanswered = scored.filter((row) => row.read === null).length;
  return { idea: "tone",
     rows: scored,
     metrics: { withinOne: value },
     floors: [{ name: "tone within 1",
     value,
     floor: 0.9,
     op: ">=",
     ok: value !== null && value >= 0.9 }],
     passed: unanswered === 0 && value !== null && value >= 0.9,
     unanswered };
}

import { spikeCalls, type SpikeIdea } from "@judge/ideaSpikes";
import { scoreAnswer } from "@judge/questions";
import { hotPhrases } from "@judge/repetition";
import type { WardenInput } from "@judge/warden";
import type { WardenCheckFinding } from "@stagecraft/warden";
import type { JudgeRuntime } from "./judge";

interface Sample { messageId: number; adversity: number | null; change: number | null; tension: number | null; tone: number | null }
interface History { key: string; rows: Sample[]; count: number; last: Partial<Record<string, number>> }
const histories = new WeakMap<JudgeRuntime, History>();
const uses = { adversity: "adversityTrend", idle: "idleCheck", tone: "toneCheck" } as const;

export async function checkIdeaWarden(runtime: JudgeRuntime, input: WardenInput): Promise<WardenCheckFinding[]> {
  const scope = input.ideaScope;
  if (!scope) return [];
  const history = histories.get(runtime);
  const current: History = history?.key === scope.key ? history : { key: scope.key, rows: [], count: 0, last: {} };
  if (current.rows.some((row) => row.messageId === scope.messageId)) return [];
  const sample: Sample = { messageId: scope.messageId, adversity: null, change: null, tension: null, tone: null };
  const jobs = (Object.keys(uses) as Array<keyof typeof uses>).filter((idea) => runtime.active(uses[idea]) && (idea !== "tone" || scope.intent.trim()));
  await Promise.all(jobs.map(async (idea) => {
    const row = idea === "adversity" ? { id: "reply", playerName: scope.player, reply: input.reply.text, level: 0 }
      : idea === "idle" ? { id: "reply", reply: input.reply.text, change: 0, tension: 0 }
        : { id: "reply", intent: scope.intent, reply: input.reply.text, level: 0 };
    const request = spikeCalls(idea as SpikeIdea, { revision: 1, rows: [row] })[0].request;
    const summarize = (answers: Parameters<typeof scoreAnswer>[0] | null) =>
      Object.fromEntries(Object.keys(request.questions).map((key) => [key, answers ? scoreAnswer(answers, key)?.score ?? -1 : -1]));
    const result = await runtime.ask(uses[idea], request, { timeoutMs: 4000, summarize }).catch(() => null);
    if (!result?.answers || result.discarded) return;
    for (const key of Object.keys(request.questions) as Array<"adversity" | "change" | "tension" | "tone">) sample[key] = scoreAnswer(result.answers, key)?.score ?? null;
  }));
  if (!scope.stillOwns()) return [];
  current.count += 1;
  current.rows = [...current.rows.filter((row) => row.messageId < scope.messageId), sample].slice(-20);
  histories.set(runtime, current);
  const findings: WardenCheckFinding[] = [];
  const emit = (family: "adversity" | "idle" | "tone" | "repetition", count: number, hits: number, cooldown: number, predicate: (row: Sample) => boolean, text: string) => {
    const rows = current.rows.slice(-count);
    const at = current.count;
    const last = current.last[family];
    if (rows.length !== count || rows.filter(predicate).length < hits || (last !== undefined && at - last < cooldown)) return;
    current.last[family] = at;
    findings.push({ family, text, facts: [], score: at });
  };
  if (runtime.active("adversityTrend")) emit("adversity", 20, 18, 20, (row) => row.adversity !== null && row.adversity < 1,
    "World pressure: recent replies have cost little. Let an authored complication create a choice; never decide the player's loss or action.");
  if (runtime.active("idleCheck")) emit("idle", 4, 3, 4, (row) => row.change !== null && row.tension !== null && row.change < 2.5 && row.tension < 1.5,
    "World pressure: little has changed. Let the world offer a concrete development or choice, leaving the player's response to them.");
  if (runtime.active("toneCheck") && sample.tension !== null && sample.tension <= 2.5) emit("tone", 5, 5, 5, (row) => row.tone !== null && row.tone < 1.5,
    "Tone: return to the story's authored tone and current goal without undoing events or deciding the player's response.");
  if (runtime.active("repetitionCheck")) {
    const hot = hotPhrases(scope.replies);
    const last = current.last.repetition;
    if (hot.length && (last === undefined || current.count - last >= 6)) {
      current.last.repetition = current.count;
      findings.push({ family: "repetition", text: `Vary the prose: avoid these repeated phrases: ${hot.join("; ")}.`, facts: [] });
    }
  }
  return findings;
}

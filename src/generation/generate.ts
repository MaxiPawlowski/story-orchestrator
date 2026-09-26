import { askText, isPlanted, type ModelAsk, type ModelCall } from "@extraction/modelRoute";
import { stripReasoningBlocks } from "@extraction/parse";
import type { NormalizedStoryV2 } from "@engine/index";
import { buildPickPrompt, chainScore, judgeVerdict, parsePick, pickChain, type ChainRead } from "@judge/index";
import { runCodeChecks, runCritic } from "./critic";
import { parseGeneratedBeats } from "./parse";
import { renderGenerationPrompt } from "./prompts";
import type { CodeCheckResult, CriticVerdict, GeneratedBeat, PlannedExpansionInput, VariantRecord } from "./types";

export interface ExpansionJudge {
  critic?: (beats: GeneratedBeat[]) => Promise<CriticVerdict | null>;
  variants?: { n: number; temperature: number; pick: "code" | "llm"; read: (beats: GeneratedBeat[]) => Promise<ChainRead | null> };
}

export interface ReviewedBeats {
  beats: GeneratedBeat[];
  raw: string;
  issues: string[];
  codeCheck: CodeCheckResult | null;
  verdict: CriticVerdict;
  needsReview: boolean;
  variants?: VariantRecord;
}

type Checked = { beats: GeneratedBeat[]; raw: string; issues: string[]; codeCheck: CodeCheckResult | null };

export async function generateBeats(story: NormalizedStoryV2, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk): Promise<{ beats: GeneratedBeat[]; raw: string; issues: string[] }> {
  const prompt = renderGenerationPrompt(story, input);
  const raw = await askText(model, prompt, { ...ask, maxTokens: 2048 });
  const parsed = parseGeneratedBeats(raw, story);
  if (!parsed.issues.length) return { beats: parsed.beats, raw, issues: [] };
  const repairRaw = await askText(model, `${prompt}\n\nPrevious response was invalid: ${parsed.issues.join("; ")}\nReturn corrected exact JSON only.`, { ...ask, maxTokens: 2048 });
  const repaired = parseGeneratedBeats(repairRaw, story);
  return { beats: repaired.beats, raw: repairRaw, issues: repaired.issues };
}

// Generation, then the binding code checks with their one repair pass: everything before a critic.
async function generateChecked(story: NormalizedStoryV2, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk): Promise<Checked> {
  const generated = await generateBeats(story, input, model, ask);
  if (generated.issues.length) return { ...generated, codeCheck: null };
  const initialCheck = runCodeChecks(story, input, generated.beats);
  if (initialCheck.ok || isPlanted(model, ask)) return { ...generated, codeCheck: initialCheck };
  const repairRaw = await askText(
    model,
    `${renderGenerationPrompt(story, input)}\n\nPrevious JSON failed hard code checks: ${initialCheck.issues.join("; ")}\nReturn corrected exact JSON only.`,
    { ...ask, maxTokens: 2048 },
  );
  const repaired = parseGeneratedBeats(repairRaw, story);
  if (repaired.issues.length) return { ...generated, codeCheck: initialCheck };
  return { beats: repaired.beats, raw: repairRaw, issues: [], codeCheck: runCodeChecks(story, input, repaired.beats) };
}

const checkFailure = (checked: Checked): ReviewedBeats =>
  checked.issues.length || !checked.codeCheck
    ? { ...checked, codeCheck: null, verdict: { pass: false, issues: checked.issues, raw: checked.raw }, needsReview: true }
    : { ...checked, verdict: { pass: false, issues: checked.codeCheck.issues, raw: "CODE_CHECK" }, needsReview: true };

export async function generateReviewedBeats(story: NormalizedStoryV2, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk, judge: ExpansionJudge = {}): Promise<ReviewedBeats> {
  if (judge.variants && judge.variants.n > 1 && !isPlanted(model, ask)) return generateVariants(story, input, model, ask, judge.variants);
  const checked = await generateChecked(story, input, model, ask);
  if (checked.issues.length || !checked.codeCheck) return checkFailure(checked);
  if (isPlanted(model, ask)) return { ...checked, verdict: { pass: checked.codeCheck.ok, issues: checked.codeCheck.issues, raw: "DEBUG" }, needsReview: !checked.codeCheck.ok };
  if (!checked.codeCheck.ok) return checkFailure(checked);
  return { ...checked, ...(await runCritic(story, input, checked.beats, model, ask, judge.critic)) };
}

// v2.2 plan 07: N chains, one at a time on the P3 lane, each with today's repair pass; the judge
// scores the survivors and code (or the LLM, from the judge's top two) picks. The judge never writes
// beats: with no survivor it is today's failed / needs-review path.
async function generateVariants(story: NormalizedStoryV2, input: PlannedExpansionInput, model: ModelCall, ask: ModelAsk, variants: NonNullable<ExpansionJudge["variants"]>): Promise<ReviewedBeats> {
  const runs: Array<{ checked: Checked; ms: number }> = [];
  for (let index = 0; index < variants.n; index += 1) {
    const started = Date.now();
    runs.push({ checked: await generateChecked(story, input, model, { ...ask, temperature: variants.temperature }), ms: Date.now() - started });
  }
  const survivors = runs.map((run, index) => ({ index, checked: run.checked })).filter((run) => !run.checked.issues.length && run.checked.codeCheck?.ok);
  const record = (patch: Partial<VariantRecord>): VariantRecord => ({
    generated: variants.n,
    survivors: survivors.length,
    scores: [],
    picked: null,
    picker: "code",
    timesMs: runs.map((run) => run.ms),
    ...patch
  });
  if (!survivors.length) return { ...checkFailure((runs.find((run) => !run.checked.issues.length) ?? runs[0]).checked), variants: record({}) };

  const reads = await Promise.all(survivors.map((run) => variants.read(run.checked.beats).catch(() => null)));
  const scores = reads.map((read) => (read ? chainScore(read) : null));
  if (reads.every((read) => read === null)) {
    const first = survivors[0];
    return { ...first.checked, ...(await runCritic(story, input, first.checked.beats, model, ask)), variants: record({ scores, picked: first.index, pickFallback: "judge" }) };
  }
  const codePick = pickChain(reads);
  if (codePick === null) {
    const best = scores.reduce<number>((top, value, index) => ((value ?? -Infinity) > (scores[top] ?? -Infinity) ? index : top), 0);
    const read = reads[best];
    const verdict: CriticVerdict = read ? { ...judgeVerdict(read), raw: "JUDGE", judge: read } : { pass: false, issues: ["No variant was judged."], raw: "JUDGE" };
    return { ...survivors[best].checked, verdict, needsReview: true, variants: record({ scores, picked: survivors[best].index }) };
  }

  let chosen = codePick;
  let picker: VariantRecord["picker"] = "code";
  let pickFallback: VariantRecord["pickFallback"];
  const passing = reads.map((read, index) => ({
    read,
    index,
  })).filter((entry) => entry.read && judgeVerdict(entry.read).pass).sort((left, right) => chainScore(right.read!) - chainScore(left.read!) || left.index - right.index);
  if (variants.pick === "llm" && passing.length >= 2) {
    const target = story.checkpointById[input.candidate.targetAnchorId];
    const pair: [number, number] = [passing[0].index, passing[1].index];
    const raw = await askText(
      model,
      buildPickPrompt({ name: target?.name ?? input.candidate.targetAnchorId, objective: target?.objective ?? "" }, [survivors[pair[0]].checked.beats, survivors[pair[1]].checked.beats]),
      { ...ask, pass: "critic", maxTokens: 64 },
    ).catch(() => "");
    const answer = parsePick(stripReasoningBlocks(raw));
    if (answer === null) pickFallback = "llm";
    else {
      chosen = pair[answer];
      picker = "llm";
    }
  }
  const read = reads[chosen]!;
  const verdict: CriticVerdict = { ...judgeVerdict(read), raw: "JUDGE", judge: read };
  return { ...survivors[chosen].checked, verdict, needsReview: !verdict.pass, variants: record({ scores, picked: survivors[chosen].index, picker, ...(pickFallback ? { pickFallback } : {}) }) };
}

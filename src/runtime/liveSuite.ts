import { buildFixtureRun, callExtractionModel, parseSharedReadResponse, type ExtractionFixtureSpec } from "@extraction/index";
import { buildTypedPlan, readTypedDeltas } from "@judge/index";
import type { RuntimeManager } from "./runtimeManager";

export interface LiveFixtureResult {
  prompt: string;
  rawResponse: string;
  deltas: Array<{ q: string; v: unknown; evidence: string; judge?: number }>;
  facts: Array<{ text: string; importance: number }>;
  rejected: Array<{ line: string; reason: string }>;
  // v2.3 plan 01 §F: the same read already parses these tiers, and the suite scored only plot
  // deltas while reporting the number as live extraction accuracy. They are handed back so a
  // fixture that states an expectation for them can be scored against it.
  memory: Array<{ tier: string; text: string }>;
  arcs: Array<{ kind: string; text: string }>;
  epistemic: Array<{ tag: string; subject: string; hiddenFrom?: string; content: string }>;
  ledger: Array<{ entity: string; field: string; value: string }>;
  judged?: { answered: string[]; answers: unknown; model: string | null; fallback?: string };
}

// v2.2 plan 06 `so-live-suite --judge`: a fixture's own hint sidecar ({key: {read_as, criteria?}})
// is merged into its story, the judge reads the hinted qualities first, and the LLM prompt covers
// only the rest, exactly as runSharedRead splits a cadence read. The call is a probe, so nothing is
// recorded in the open chat.
export interface LiveFixtureOptions {
  judge?: boolean;
  hints?: Record<string, Record<string, unknown>>;
}

export interface LiveSuiteHandle {
  runFixture: (spec: ExtractionFixtureSpec, options?: LiveFixtureOptions) => Promise<LiveFixtureResult>;
}

const withHints = (story: unknown, hints: LiveFixtureOptions["hints"]) => {
  if (!hints || !story || typeof story !== "object") return story;
  const raw = story as { qualities?: Array<Record<string, unknown>> };
  return { ...raw, qualities: (raw.qualities ?? []).map((quality) => ({ ...quality, ...(hints[String(quality.key)] ?? {}) })) };
};

export function registerLiveSuite(manager: RuntimeManager) {
  const handle: LiveSuiteHandle = {
    runFixture: async (spec, options = {}) => {
      const hinted = { ...spec, story: withHints(spec.story, options.hints) };
      const first = buildFixtureRun(hinted);
      let judged: LiveFixtureResult["judged"];
      let judgedDeltas: LiveFixtureResult["deltas"] = [];
      const judge = globalThis.storyOrchestratorJudge;
      if (options.judge && judge) {
        const qualities = first.scope.map((entry) => entry.quality).filter((quality) => quality.read_as && quality.source === "extractor");
        const checkpoint = first.story.checkpointById[first.activeCheckpointId];
        const window = spec.transcript.map((entry) => ({ id: entry.index, speaker: entry.speaker, text: entry.text }));
        const plan = qualities.length && checkpoint ? buildTypedPlan(qualities, window, { title: first.story.title, checkpointName: checkpoint.name, objective: checkpoint.objective }) : null;
        if (plan) {
          const result = await judge.probe(plan.request);
          const read = result.answers ? readTypedDeltas(result.answers, plan, qualities, window) : { deltas: [], answered: [] };
          judged = { answered: read.answered, answers: result.answers, model: result.model, ...(result.fallback ? { fallback: result.fallback } : {}) };
          judgedDeltas = read.deltas.map((delta) => ({ q: delta.q, v: delta.v, evidence: delta.evidence, judge: delta.confidence }));
        }
      }
      const answered = judged?.answered ?? [];
      const { story, prompt } = answered.length ? buildFixtureRun({ ...hinted, excludeKeys: answered }) : first;
      const profileId = manager.getExtractionSettings().profileId;
      const rawResponse = await callExtractionModel(prompt, { profileId, role: "read", maxTokens: 512 });
      const parsed = parseSharedReadResponse(rawResponse, story);
      return {
        prompt,
        rawResponse,
        deltas: [...judgedDeltas, ...parsed.deltas.filter((entry) => !answered.includes(entry.delta.q)).map((entry) => ({ q: entry.delta.q, v: entry.delta.v, evidence: entry.evidence }))],
        facts: parsed.facts.map((entry) => ({ text: entry.text, importance: entry.importance })),
        rejected: parsed.rejected,
        memory: parsed.memory.map((entry) => ({ tier: entry.tier, text: entry.text })),
        arcs: parsed.arcs.map((entry) => ({ kind: entry.kind, text: entry.text })),
        epistemic: parsed.epistemic.map((entry) => ({ tag: entry.tag, subject: entry.subject, ...(entry.hiddenFrom ? { hiddenFrom: entry.hiddenFrom } : {}), content: entry.content })),
        ledger: parsed.ledger.map((entry) => ({ entity: entry.entity, field: entry.field, value: entry.value })),
        ...(judged ? { judged } : {}),
      };
    },
  };
  globalThis.storyOrchestratorLiveSuite = handle;
}

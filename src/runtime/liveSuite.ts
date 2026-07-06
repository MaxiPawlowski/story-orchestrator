import { buildFixtureRun, callExtractionModel, parseSharedReadResponse, type ExtractionFixtureSpec } from "@extraction/index";
import type { RuntimeManager } from "./runtimeManager";

export interface LiveFixtureResult {
  prompt: string;
  rawResponse: string;
  deltas: Array<{ q: string; v: unknown; evidence: string }>;
  facts: Array<{ text: string; importance: number }>;
  rejected: Array<{ line: string; reason: string }>;
}

export interface LiveSuiteHandle {
  runFixture: (spec: ExtractionFixtureSpec) => Promise<LiveFixtureResult>;
}

export function registerLiveSuite(manager: RuntimeManager) {
  const handle: LiveSuiteHandle = {
    runFixture: async (spec) => {
      const { story, prompt } = buildFixtureRun(spec);
      const profileId = manager.getExtractionSettings().profileId;
      const rawResponse = await callExtractionModel(prompt, { profileId, maxTokens: 512 });
      const parsed = parseSharedReadResponse(rawResponse, story);
      return {
        prompt,
        rawResponse,
        deltas: parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v, evidence: entry.evidence })),
        facts: parsed.facts.map((entry) => ({ text: entry.text, importance: entry.importance })),
        rejected: parsed.rejected,
      };
    },
  };
  globalThis.storyOrchestratorLiveSuite = handle;
}

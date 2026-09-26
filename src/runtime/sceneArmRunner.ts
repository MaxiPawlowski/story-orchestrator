import { estimateTokens } from "@extraction/callBudget";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { sceneArmPasses, type SceneArm, type SceneArmSpec } from "@extraction/sceneArms";
import { parseEpistemicLine, parseLedgerLine } from "@memory/parse";
import type { ParsedEpistemicSignal, ParsedLedgerSignal } from "@memory/types";

export interface SceneArmResult {
  arm: SceneArm;
  passes: Array<{ from: number; to: number; promptChars: number }>;
  promptChars: number;
  epistemic: ParsedEpistemicSignal[];
  ledger: ParsedLedgerSignal[];
  raw: string[];
}

const linesOf = (raw: string) => stripChannelNoise(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export function sceneArmRunner(model: ModelCall): (spec: SceneArmSpec, arm: SceneArm, chunkBudget?: number) => Promise<SceneArmResult> {
  return async (spec, arm, chunkBudget) => {
    const passes = sceneArmPasses(spec, arm, chunkBudget ? { budget: chunkBudget, promptOverhead: 0, count: estimateTokens } : undefined);
    const result: SceneArmResult = { arm, passes: [], promptChars: 0, epistemic: [], ledger: [], raw: [] };
    for (const pass of passes) {
      const epistemicRaw = await askText(model, pass.epistemicPrompt, { role: "read", pass: "epistemic", maxTokens: 512 });
      const ledgerRaw = await askText(model, pass.ledgerPrompt, { role: "read", pass: "ledger", maxTokens: 512 });
      const promptChars = pass.epistemicPrompt.length + pass.ledgerPrompt.length;
      result.passes.push({ from: pass.from, to: pass.to, promptChars });
      result.promptChars += promptChars;
      result.raw.push(epistemicRaw, ledgerRaw);
      linesOf(epistemicRaw).forEach((line) => {
        const signal = parseEpistemicLine(line);
        if (signal) result.epistemic.push(signal);
      });
      linesOf(ledgerRaw).forEach((line) => result.ledger.push(...parseLedgerLine(line)));
    }
    return result;
  };
}

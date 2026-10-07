import { stripReasoningBlocks } from "@extraction/parse";
import { judgeUseActive } from "@judge/index";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { spriteClassifyLocal, spriteExpressionModel } from "@services/stHost/sprites";
import { log } from "@utils/log";
import type { ExpressionDeps, ExpressionSource, ExpressionStep } from "./classify";

export interface ExpressionCall {
  at: number;
  chatId: string | null;
  segments: number;
  source: ExpressionSource;
  latencyMs: number;
  steps: ExpressionStep[];
  thinking: string | null;
}

const RING = 50;
const LLM_TIMEOUT_MS = 15_000;
const LLM_TOKENS = 160;

export class ExpressionCallRing {
  private rows: ExpressionCall[] = [];

  record(row: ExpressionCall): void {
    this.rows = [...this.rows, row].slice(-RING);
  }

  list = (): readonly ExpressionCall[] => this.rows;
}

export interface ExpressionCallTrace {
  steps: ExpressionStep[];
  thinking: string | null;
}

export function expressionDeps(manager: RuntimeManager, trace: ExpressionCallTrace): ExpressionDeps {
  const global = manager.getGlobalSettings();
  const judge = manager.getJudge();
  const profileId = global.sprites.profileId || global.image.directorProfileId;
  return {
    judge: judge && judgeUseActive(global.judge, "expressions")
      ? async (request) => (await judge.ask("expressions", request, { timeoutMs: Math.max(global.judge.timeoutMs, 4000) })).answers
      : null,
    llm: profileId
      ? async (system, user, grammar) => {
        const reply = await spriteExpressionModel(profileId, [{ role: "system", content: system }, { role: "user", content: user }], LLM_TOKENS, grammar,
          AbortSignal.timeout(LLM_TIMEOUT_MS));
        trace.thinking = reply.thinking;
        return stripReasoningBlocks(reply.text);
      }
      : null,
    local: spriteClassifyLocal,
    warn: (step, error) => log.warn(`Sprite expressions: ${step} failed`, error),
    step: (entry) => { trace.steps.push(entry); },
  };
}

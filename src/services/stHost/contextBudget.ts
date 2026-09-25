import { getContext } from "./context";
import type { ScriptHostModule } from "./hostTypes";
import { scriptModule } from "./modules";

export interface PromptBudget {
  context: number;
  response: number;
  prompt: number;
  api: string | null;
}

export type PromptBudgetRead = ({ ok: true } & PromptBudget) | { ok: false; reason: string };

type BudgetExports = Pick<ScriptHostModule, "getMaxContextTokens" | "getMaxResponseTokens" | "getMaxPromptTokens">;

const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function promptBudgetFrom(exports: BudgetExports | null | undefined, api: string | null): PromptBudgetRead {
  if (!exports || typeof exports.getMaxPromptTokens !== "function" || typeof exports.getMaxContextTokens !== "function" || typeof exports.getMaxResponseTokens !== "function") {
    return { ok: false, reason: "this build exports no getMaxPromptTokens from script.js" };
  }
  try {
    const context = finite(Number(exports.getMaxContextTokens()));
    const response = finite(Number(exports.getMaxResponseTokens()));
    const prompt = finite(Number(exports.getMaxPromptTokens()));
    if (context === null || response === null || prompt === null) return { ok: false, reason: "the main API reported no usable context size" };
    if (prompt <= 0) return { ok: false, reason: `the reply length (${response}) leaves no room in a context of ${context}` };
    return { ok: true, context, response, prompt, api };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "reading the context size failed" };
  }
}

export function readPromptBudget(): PromptBudgetRead {
  const api = getContext().mainApi;
  return promptBudgetFrom(scriptModule, typeof api === "string" && api ? api : null);
}

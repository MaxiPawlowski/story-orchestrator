import {
  buildWardenRequests, CONTINUITY_TIMEOUT_MS, houseRulesDecidedInCode, readWarden, readWardenLore, wardenCallFamilies, wardenRecordP, type WardenInput,
} from "@judge/index";
import type { WardenCheckFinding } from "@stagecraft/index";
import type { JudgeRuntime } from "./judge";

export const checkWarden = async (judge: () => JudgeRuntime | null, input: WardenInput): Promise<WardenCheckFinding[] | null> => {
  const runtime = judge();
  const today = { ...input, lore: [] };
  const lore: WardenInput = { reply: input.reply, facts: [], agency: null, houseRules: [], lore: input.lore ?? [] };
  const requests = buildWardenRequests(today);
  const loreRequests = buildWardenRequests(lore);
  if (!runtime?.enabled()) return null;
  const ideas = input.ideaScope ? await (await import("./judgeIdeasWarden")).checkIdeaWarden(runtime, input) : [];
  if (!requests.length && !loreRequests.length && !houseRulesDecidedInCode(today)) return ideas.length ? ideas : null;
  const ask = async (use: string, list: typeof requests, asked: WardenInput) => {
    if (!list.length) return null;
    const families = wardenCallFamilies(asked);
    const results = await Promise.all(list.map((request) => runtime.ask(use, request, { timeoutMs: CONTINUITY_TIMEOUT_MS, summarize: (answers) => wardenRecordP(answers, asked), families })));
    return results.some((result) => !result.answers) ? null : Object.assign({}, ...results.map((result) => result.answers));
  };
  const [asked, loreAnswers] = await Promise.all([ask("warden", requests, today), ask("wardenLore", loreRequests, lore)]);
  const answers = asked ?? (!requests.length && houseRulesDecidedInCode(today) ? {} : null);
  if (!answers && !loreAnswers) return ideas.length ? ideas : null;
  const contradicted = loreAnswers ? readWardenLore(loreAnswers, lore) : null;
  return [...ideas, ...(answers ? readWarden(answers, today) : []), ...(contradicted ? [{ ...contradicted, facts: [] }] : [])];
};

import type { DeliverySheet } from "@engine/deliverySchema";
import { guardRewrite, refused, type GuardVerdict } from "./guards";
import { projectStyle, projectionTexts, type StyleProjection } from "./projection";
import { buildPolishPrompt, parsePolishAnswer, polishMaxTokens, type ContextLine } from "./prompt";
import { assemble, findingsIn, windowsFor, type Finding, type PolishTargets, type PolishWindow } from "./windows";

export interface PlanInput {
  reply: string;
  from?: number;
  speaker: string;
  sheet?: DeliverySheet;
  tics: readonly string[];
  repeats: readonly string[];
  mood?: string | null;
  withheld: readonly string[];
  resting?: (text: string) => string;
  context: readonly ContextLine[];
}

export interface PolishPlan {
  reply: string;
  speaker: string;
  targets: PolishTargets;
  findings: Finding[];
  windows: PolishWindow[];
  style: StyleProjection;
  prompt: string;
  maxTokens: number;
  reference: string[];
}

export type PlanSkip = "unbalanced-quotes" | "no-finding";

export const planPolish = (input: PlanInput): PolishPlan | { skip: PlanSkip } => {
  const style = projectStyle({ sheet: input.sheet, mood: input.mood, withheld: input.withheld, resting: input.resting });
  const ticSet = new Set(style.tics.map((tic) => tic.toLowerCase()));
  const targets: PolishTargets = {
    avoid: style.avoid,
    tics: input.tics.filter((tic) => ticSet.has(tic.toLowerCase())),
    repeats: input.repeats.filter((phrase) => !input.withheld.some((name) => phrase.toLowerCase().includes(name.toLowerCase()))),
  };
  const findings = findingsIn(input.reply, targets, input.from ?? 0);
  if (!findings) return { skip: "unbalanced-quotes" };
  if (!findings.length) return { skip: "no-finding" };
  const windows = windowsFor(input.reply, findings);
  if (!windows.length) return { skip: "no-finding" };
  const context = input.context.map((line) => ({ speaker: line.speaker, text: line.text }));
  return {
    reply: input.reply, speaker: input.speaker, targets, findings, windows, style,
    prompt: buildPolishPrompt({ speaker: input.speaker, style, windows, reply: input.reply, context }),
    maxTokens: polishMaxTokens(windows),
    reference: [...projectionTexts(style), ...context.map((line) => line.text)],
  };
};

export interface JudgeContext {
  names: readonly string[];
  playerNames: readonly string[];
  restates?: (text: string) => boolean;
}

export const judgePolish = (plan: PolishPlan, answer: { text: string; finish?: string | null }, context: JudgeContext): GuardVerdict => {
  const parsed = parsePolishAnswer(answer.text, answer.finish, plan.windows);
  if (!parsed.ok) return refused(parsed.code);
  return guardRewrite({
    original: plan.reply, windows: plan.windows, candidate: assemble(plan.reply, plan.windows, parsed.replaced), targets: plan.targets,
    names: context.names, playerNames: context.playerNames, reference: plan.reference, restates: context.restates,
  });
};

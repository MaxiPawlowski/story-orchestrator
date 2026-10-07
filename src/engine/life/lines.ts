import { PLAYER_REF } from "../agency";
import {
  RELATIONSHIP_TOWARD_PLAYER, agendaRepeatsKey, agendaStepKey, relationshipKey,
  type Agenda, type AgendaStep, type LifeMember, type NormalizedStoryV2, type PrimitiveValue,
} from "../schema";
import { effectiveMood, isAway, whereabouts } from "./presence";

type Values = Readonly<Record<string, PrimitiveValue>>;
type Read = Readonly<Record<string, unknown>>;

export const MEANWHILE_SHOWN = 3;
export const LIFE_BLOCK_HEADER = "What only you feel and do (private to you; never say the numbers):";

const doneCount = (member: string, agenda: Agenda, values: Read): number => {
  const steps = Math.min(agenda.steps.length, Number(values[agendaStepKey(member, agenda.id)] ?? 0));
  return steps + Number(values[agendaRepeatsKey(member, agenda.id)] ?? 0);
};

const doneSteps = (member: string, agenda: Agenda, values: Read): AgendaStep[] => {
  const steps = Math.min(agenda.steps.length, Number(values[agendaStepKey(member, agenda.id)] ?? 0));
  const repeats = Number(values[agendaRepeatsKey(member, agenda.id)] ?? 0);
  const last = agenda.steps.at(-1);
  return [...agenda.steps.slice(0, steps), ...(last && repeats > 0 ? [last] : [])];
};

const towardName = (story: NormalizedStoryV2, toward: string): string =>
  (toward === RELATIONSHIP_TOWARD_PLAYER ? PLAYER_REF : story.roster.find((member) => member.id === toward)?.name ?? toward);

const relationshipLines = (story: NormalizedStoryV2, member: LifeMember, values: Values): string[] => member.relationships.flatMap((relationship) =>
  relationship.axes.map((axis) => {
    const value = values[relationshipKey(member.id, relationship.toward, axis)];
    const shown = typeof value === "number" ? value : relationship.start;
    const label = relationship.label ? ` (${relationship.label})` : "";
    return `- Your ${axis} toward ${towardName(story, relationship.toward)}${label}: ${shown} on a scale from ${relationship.range[0]} to ${relationship.range[1]}.`;
  }));

export const relationshipFeelings = (story: NormalizedStoryV2, values: Values, memberId: string): string[] => {
  const member = story.life?.members.find((entry) => entry.id === memberId);
  return member ? relationshipLines(story, member, values).map((line) => line.replace(/^- Your /, "")) : [];
};

const meanwhileLines = (member: LifeMember, values: Values, publicOnly: boolean): string[] => member.agenda.flatMap((agenda) =>
  doneSteps(member.id, agenda, values).filter((step) => !publicOnly || step.public).slice(-MEANWHILE_SHOWN).map((step) => step.text));

export const privateLifeLines = (story: NormalizedStoryV2, values: Values, memberId: string, accepted: readonly string[] = []): string => {
  const members = story.life?.members ?? [];
  const self = members.find((member) => member.id === memberId);
  const mood = self ? effectiveMood(self, values) : null;
  const own = self ? meanwhileLines(self, values, false).map((text) => `- Meanwhile, off stage, you: ${text}`) : [];
  const shared = members.filter((member) => member.id !== memberId).flatMap((member) => meanwhileLines(member, values, true))
    .map((text) => `- Meanwhile, as everyone knows: ${text}`);
  const lines = [
    ...(self ? relationshipLines(story, self, values) : []),
    ...(mood ? [`- Your mood right now: ${mood}.`] : []),
    ...own, ...accepted.map((text) => `- Meanwhile, off stage, you: ${text}`), ...shared,
  ];
  return lines.length ? [LIFE_BLOCK_HEADER, ...lines].join("\n") : "";
};

export const agendaWorldInfo = (story: NormalizedStoryV2 | null, values: Read): unknown[] =>
  (story?.life?.members ?? []).flatMap((member) => member.agenda.flatMap((agenda) =>
    doneSteps(member.id, agenda, values).flatMap((step) => (step.effect?.world_info !== undefined ? [step.effect.world_info] : []))));

export interface LandedStep {
  memberId: string;
  agendaId: string;
  index: number;
  step: AgendaStep;
}

export const landedSteps = (story: NormalizedStoryV2 | null, before: Read, after: Read): LandedStep[] =>
  (story?.life?.members ?? []).flatMap((member) => member.agenda.flatMap((agenda) => {
    const was = doneCount(member.id, agenda, before);
    const now = doneCount(member.id, agenda, after);
    if (now <= was) return [];
    const index = Math.min(agenda.steps.length - 1, now - 1);
    return [{ memberId: member.id, agendaId: agenda.id, index, step: agenda.steps[index] }];
  }));

export const lifeMoved = (story: NormalizedStoryV2 | null, before: Read, after: Read): boolean => landedSteps(story, before, after).length > 0;

export interface LifeAuthorRow {
  id: string;
  name: string;
  away: string | null;
  mood: string | null;
  relationships: Array<{ key: string; toward: string; axis: string; value: number; range: [number, number] }>;
  agendas: Array<{ id: string; goal: string; done: number; of: number; next: string | null }>;
}

export const lifeAuthorRows = (story: NormalizedStoryV2, values: Values): LifeAuthorRow[] => (story.life?.members ?? []).map((member) => ({
  id: member.id,
  name: story.roster.find((entry) => entry.id === member.id)?.name ?? member.id,
  away: isAway(member, values) ? whereabouts(member, values) : null,
  mood: effectiveMood(member, values),
  relationships: member.relationships.flatMap((relationship) => relationship.axes.map((axis) => {
    const key = relationshipKey(member.id, relationship.toward, axis);
    const value = values[key];
    return { key, toward: relationship.toward, axis, value: typeof value === "number" ? value : relationship.start, range: relationship.range };
  })),
  agendas: member.agenda.map((agenda) => {
    const done = Math.min(agenda.steps.length, Number(values[agendaStepKey(member.id, agenda.id)] ?? 0));
    return { id: agenda.id, goal: agenda.goal, done, of: agenda.steps.length, next: agenda.steps[done]?.text ?? null };
  }),
}));

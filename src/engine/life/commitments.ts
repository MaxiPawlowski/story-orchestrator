import { evaluateGate, gateKeys } from "../gates";
import {
  CLOCK_DAY_KEY, COMMITMENT_OPEN_LIMIT, COMMITMENT_START, commitKey,
  type Commitment, type LifeMember, type NormalizedStory, type PrimitiveValue,
} from "../schema";
import { isAway } from "./presence";

type Read = Readonly<Record<string, unknown>>;
type Write = { q: string; v: PrimitiveValue };

export type CommitmentState = "made" | "kept" | "broken";

export interface HeldCommitment {
  member: string;
  commitment: Commitment;
}

export interface CommitmentRow {
  text: string;
  state: CommitmentState;
  at: number;
}

export interface KeptCommitment {
  memberId: string;
  commitment: Commitment;
}

export const COMMITMENT_COPY = {
  open: (what: string) => `You told the player you would ${what}. It is not done yet; it is yours to keep, raise or explain.`,
  overdue: "It is overdue.",
  kept: (what: string) => `You kept your word to the player: ${what}.`,
  broken: (what: string) => `You did not keep your word to the player: ${what}.`,
  promised: (what: string, state: CommitmentState) => `Promised you: ${what} (${state === "made" ? "open" : state})`,
  hook: (name: string, what: string) => `${name} has promised the player to ${what}`,
};

const reader = (values: Read) => ({ get: (key: string) => values[key] as PrimitiveValue | undefined });

const at = (values: Read, key: string): number | null => (typeof values[key] === "number" ? values[key] as number : null);

export const heldCommitments = (story: Pick<NormalizedStory, "life">): HeldCommitment[] =>
  (story.life?.members ?? []).flatMap((member) => (member.commitments ?? []).map((commitment) => ({ member: member.id, commitment })));

export const madeAt = (member: string, commitment: Commitment, values: Read): number | null =>
  (commitment.made_when === COMMITMENT_START ? 0 : at(values, commitKey(member, commitment.id, "made")));

export const commitmentState = (member: string, commitment: Commitment, values: Read): { state: CommitmentState; at: number } | null => {
  const made = madeAt(member, commitment, values);
  if (made === null) return null;
  const kept = at(values, commitKey(member, commitment.id, "kept"));
  if (kept !== null) return { state: "kept", at: kept };
  const broken = at(values, commitKey(member, commitment.id, "broken"));
  return broken !== null ? { state: "broken", at: broken } : { state: "made", at: made };
};

export const commitmentOverdue = (member: string, commitment: Commitment, values: Read, boundary: number): boolean => {
  const state = commitmentState(member, commitment, values);
  if (state?.state !== "made") return false;
  const due = commitment.due;
  if (due && "story_day" in due) return typeof values[CLOCK_DAY_KEY] === "number" && (values[CLOCK_DAY_KEY] as number) > due.story_day;
  return boundary - state.at >= (due && "boundaries" in due ? due.boundaries : COMMITMENT_OPEN_LIMIT);
};

const holds = (gate: Commitment["kept_when"] | undefined, values: Read): boolean => Boolean(gate && evaluateGate(gate, reader(values)));

export const commitmentLatches = (story: Pick<NormalizedStory, "life">, view: { boundary: number; values: Read }): Write[] =>
  heldCommitments(story).flatMap(({ member, commitment }): Write[] => {
    const state = commitmentState(member, commitment, view.values);
    if (!state) return commitment.made_when !== COMMITMENT_START && holds(commitment.made_when, view.values) ? [{ q: commitKey(member, commitment.id, "made"), v: view.boundary }] : [];
    if (state.state !== "made") return [];
    if (holds(commitment.kept_when, view.values)) return [{ q: commitKey(member, commitment.id, "kept"), v: view.boundary }];
    return holds(commitment.broken_when, view.values) ? [{ q: commitKey(member, commitment.id, "broken"), v: view.boundary }] : [];
  });

export const commitmentDiscoveryUnits = (story: Pick<NormalizedStory, "life">, values: Read): { entries: string[][]; facts: string[][] } => ({
  entries: [],
  facts: heldCommitments(story).flatMap(({ member, commitment }) => {
    const state = commitmentState(member, commitment, values);
    if (!state) return commitment.made_when === COMMITMENT_START ? [] : [gateKeys(commitment.made_when)];
    if (state.state !== "made") return [];
    return [[...new Set([...gateKeys(commitment.kept_when), ...(commitment.broken_when ? gateKeys(commitment.broken_when) : [])])]];
  }).filter((keys) => keys.length > 0),
});

export const commitmentLines = (story: Pick<NormalizedStory, "life">, values: Read, memberId: string, boundary: number): string[] =>
  heldCommitments(story).filter(({ member }) => member === memberId).flatMap(({ member, commitment }) => {
    const state = commitmentState(member, commitment, values);
    if (state?.state === "made") return [`- ${COMMITMENT_COPY.open(commitment.what)}${commitmentOverdue(member, commitment, values, boundary) ? ` ${COMMITMENT_COPY.overdue}` : ""}`];
    if (state?.at !== boundary) return [];
    return state.state === "kept" ? [`- ${COMMITMENT_COPY.kept(commitment.what)}`] : state.state === "broken" ? [`- ${COMMITMENT_COPY.broken(commitment.what)}`] : [];
  });

export const heardCommitmentRows = (story: Pick<NormalizedStory, "life">, values: Read, holder: string): CommitmentRow[] =>
  heldCommitments(story).filter(({ member, commitment }) => member === holder && commitment.heard !== false).flatMap(({ member, commitment }) => {
    const state = commitmentState(member, commitment, values);
    return state ? [{ text: COMMITMENT_COPY.promised(commitment.what, state.state), state: state.state, at: state.at }] : [];
  });

export const commitmentHolders = (story: Pick<NormalizedStory, "life">): string[] => [...new Set(heldCommitments(story).map(({ member }) => member))];

const lifeMember = (story: Pick<NormalizedStory, "life">, id: string): LifeMember | undefined => story.life?.members.find((member) => member.id === id);

export const commitmentHooks = (story: Pick<NormalizedStory, "life" | "roster">, values: Read): string[] => heldCommitments(story)
  .filter(({ member, commitment }) => commitment.heard !== false && commitmentState(member, commitment, values)?.state === "made")
  .filter(({ member }) => {
    const life = lifeMember(story, member);
    return !life || !isAway(life, values as Readonly<Record<string, PrimitiveValue>>);
  })
  .map(({ member, commitment }) => COMMITMENT_COPY.hook(story.roster.find((entry) => entry.id === member)?.name ?? member, commitment.what));

export const keptCommitments = (story: Pick<NormalizedStory, "life"> | null, before: Read, after: Read): KeptCommitment[] => (story ? heldCommitments(story) : [])
  .filter(({ member, commitment }) => commitmentState(member, commitment, before)?.state !== "kept" && commitmentState(member, commitment, after)?.state === "kept")
  .map(({ member, commitment }) => ({ memberId: member, commitment }));

export const commitmentWorldInfo = (story: Pick<NormalizedStory, "life"> | null, values: Read): unknown[] => (story ? heldCommitments(story) : [])
  .flatMap(({ member, commitment }) => (commitment.effect?.world_info !== undefined && commitmentState(member, commitment, values)?.state === "kept" ? [commitment.effect.world_info] : []));

export interface CommitmentAuthorRow {
  member: string;
  id: string;
  what: string;
  state: CommitmentState | "waiting";
  at: number | null;
  overdue: boolean;
  heard: boolean;
}

export const commitmentAuthorRows = (story: Pick<NormalizedStory, "life">, values: Read, boundary: number): CommitmentAuthorRow[] =>
  heldCommitments(story).map(({ member, commitment }) => {
    const state = commitmentState(member, commitment, values);
    return {
      member, id: commitment.id, what: commitment.what, state: state?.state ?? "waiting", at: state?.at ?? null,
      overdue: commitmentOverdue(member, commitment, values, boundary), heard: commitment.heard !== false,
    };
  });

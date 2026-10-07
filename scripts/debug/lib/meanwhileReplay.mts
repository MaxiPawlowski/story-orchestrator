import { ratio, type B1Verdict } from './b1Runs.mts';

export const L3_CASES = 20;
export const L3_IN_GOAL_MIN = 0.85;
export const L3_NARRATED_MAX = 0;
export const L3_UNREACHED_MAX = 0;
export const L3_FLOOR_TEXT = 'in-goal rate ≥ 0.85, 0 narrated player actions, 0 references to unreached content in a spoiler subset';

export interface MeanwhileCase {
  id: string;
  member: string;
  agenda: string;
  done: number;
  window: Array<{ speaker: string; text: string }>;
  expected?: { inGoalPossible?: boolean; narratesPlayer?: boolean };
  spoiler?: boolean;
  unreached?: string[];
}

export interface CaseReplay {
  proposals: Array<{ memberId: string; agendaId: string; text: string }>;
  refused: Array<{ line: string; reason: string }>;
  error?: string;
}

export interface ProposalLabel {
  case: number;
  proposal: number;
  inGoal: boolean | null;
  narratesPlayer: boolean | null;
}

export function goalOf(story: any, member: string, agenda: string): string | null {
  const entry = (Array.isArray(story?.roster) ? story.roster : []).find((row) => row?.id === member);
  const goal = (Array.isArray(entry?.agenda) ? entry.agenda : []).find((row) => row?.id === agenda)?.goal;
  return typeof goal === 'string' ? goal : null;
}

export function proposalLabelPrompt(goal: string, proposal: { memberId: string; text: string }): string {
  return [
    'You label one off-stage event a story tool proposed for a character, for a measurement. Answer only with the two lines asked for.',
    `The character's agenda goal: ${goal}`,
    `The proposed event (${proposal.memberId}): ${proposal.text}`,
    'IN_GOAL: yes when the event serves that goal and nothing else; otherwise no.',
    'NARRATES_PLAYER: yes when the event says what the player character does, says, thinks or decides; otherwise no.',
    'Answer exactly:',
    'IN_GOAL: yes|no',
    'NARRATES_PLAYER: yes|no',
  ].join('\n');
}

const yesNo = (text: string, key: string): boolean | null => {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(yes|no)\\s*$`, 'im').exec(text);
  return match ? match[1].toLowerCase() === 'yes' : null;
};

export const parseProposalLabel = (text: string) => ({ inGoal: yesNo(text, 'IN_GOAL'), narratesPlayer: yesNo(text, 'NARRATES_PLAYER') });

export const unreachedHits = (entry: MeanwhileCase, text: string): number =>
  (entry.spoiler ? (entry.unreached ?? []).filter((needle) => needle.trim() && text.toLowerCase().includes(needle.toLowerCase())).length : 0);

export function scoreL3(cases: MeanwhileCase[], replays: CaseReplay[], labels: ProposalLabel[]) {
  const proposals = replays.flatMap((replay, index) => replay.proposals.map((proposal, at) => ({ case: index + 1, proposal: at, entry: cases[index], text: proposal.text })));
  const labelOf = (row: { case: number; proposal: number }) => labels.find((label) => label.case === row.case && label.proposal === row.proposal);
  const unlabelled = proposals.filter((row) => { const label = labelOf(row); return !label || label.inGoal === null || label.narratesPlayer === null; }).length;
  const inGoal = proposals.filter((row) => labelOf(row)?.inGoal === true).length;
  const narrated = proposals.filter((row) => labelOf(row)?.narratesPlayer === true).length;
  const spoilerProposals = proposals.filter((row) => row.entry?.spoiler);
  const unreached = spoilerProposals.filter((row) => unreachedHits(row.entry, row.text) > 0).length;
  const errors = replays.filter((replay) => replay.error).length;
  const incomplete = [
    ...(cases.length !== L3_CASES ? [`${cases.length} case(s), the fixture holds ${L3_CASES}`] : []),
    ...(replays.length !== cases.length ? [`${cases.length - replays.length} case(s) not replayed`] : []),
    ...(errors ? [`${errors} replay(s) errored`] : []),
    ...(!proposals.length ? ['no proposal in any case: the in-goal rate has no denominator'] : []),
    ...(unlabelled ? [`${unlabelled} proposal label(s) missing or unparsed`] : []),
    ...(!cases.some((entry) => entry.spoiler) ? ['no spoiler case'] : []),
  ];
  const rate = ratio(inGoal, proposals.length);
  const floors = {
    inGoal: { value: rate, proposals: proposals.length, inGoal, min: L3_IN_GOAL_MIN, ok: rate !== null && rate >= L3_IN_GOAL_MIN },
    narratedPlayer: { value: narrated, max: L3_NARRATED_MAX, ok: narrated <= L3_NARRATED_MAX, refusedByParser: replays.reduce((sum, replay) => sum + replay.refused.filter((row) => row.reason === 'narrates the player').length, 0) },
    unreached: { value: unreached, max: L3_UNREACHED_MAX, spoilerProposals: spoilerProposals.length, ok: unreached <= L3_UNREACHED_MAX },
  };
  const verdict: B1Verdict = incomplete.length ? 'INCOMPLETE' : Object.values(floors).every((floor) => floor.ok) ? 'PASS' : 'FAIL';
  return {
    floor: L3_FLOOR_TEXT,
    verdict,
    incomplete,
    floors,
    casesWithProposal: replays.filter((replay) => replay.proposals.length).length,
    refused: replays.reduce((sum, replay) => sum + replay.refused.length, 0),
    cases: replays.map((replay, index) => ({ case: index + 1, spoiler: Boolean(cases[index]?.spoiler), proposals: replay.proposals.length, refused: replay.refused.length, error: Boolean(replay.error) })),
  };
}

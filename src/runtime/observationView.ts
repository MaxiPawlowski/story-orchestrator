import { isReached, observationIdentity, type BoundaryLogEntry, type EngineState, type NormalizedStory, type Observation } from "@engine/index";
import { knownEntities, sourceKnown, sourceName, unknownEntityNames, type KnownEntities } from "@engine/codex";
import { noticedAt } from "@engine/observations";
import { termPresent } from "@utils/termPresent";
import type { LogRowView, ObservationLineView } from "./gameTypes";
import type { ObservationRecord } from "./observationRecords";

export interface ObservationSources {
  story: NormalizedStory;
  state: EngineState;
  castNames: Record<string, string>;
  enabled?: readonly string[];
  records: readonly ObservationRecord[];
  resting?: (text: string) => string;
}

export const observationsShown = (story: NormalizedStory): boolean => Boolean(story.observations?.length) && story.display?.observations !== false;

const namesUnknown = (text: string, unknown: readonly string[]): boolean => unknown.some((name) => termPresent(text, name));

const withheld = (text: string, unknown: readonly string[], resting: (text: string) => string): boolean => namesUnknown(text, unknown) || resting(text) !== text;

const fromLine = (story: NormalizedStory, observation: Observation, known: KnownEntities, castNames: Record<string, string>): string | undefined =>
  (observation.source && sourceKnown(story, observation.source, known) ? `From ${sourceName(story, observation.source, castNames)}` : undefined);

const atLine = (story: NormalizedStory, observation: Observation): string | undefined => {
  if (!isReached(observation.when)) return undefined;
  const place = story.checkpointById[observation.when.reached]?.player_name?.trim();
  return place ? `At ${place}` : undefined;
};

export function composeObservations(sources: ObservationSources): ObservationLineView[] | undefined {
  const { story, state, castNames } = sources;
  if (!observationsShown(story)) return undefined;
  const values = state.blackboard.values;
  const known = knownEntities(story, values, sources.enabled);
  const unknown = unknownEntityNames(story, known);
  const resting = sources.resting ?? ((text: string) => text);
  const cited = new Map(sources.records.filter((record) => record.outcome === "noticed").map((record) => [record.id, record]));
  return (story.observations ?? []).flatMap((observation, order) => {
    const boundary = noticedAt(observation, values);
    if (boundary === null || withheld(observation.text, unknown, resting)) return [];
    const record = cited.get(observation.id);
    const messageId = record && record.identity === observationIdentity(observation) ? record.messageId : undefined;
    const from = fromLine(story, observation, known, castNames);
    const at = atLine(story, observation);
    return [{
      line: { text: observation.text, boundary, fresh: state.boundary > 0 && boundary === state.boundary, ...(from ? { from } : {}), ...(at ? { at } : {}),
        ...(messageId !== undefined ? { messageId } : {}) },
      order,
    }];
  }).sort((left, right) => right.line.boundary - left.line.boundary || left.order - right.order).map(({ line }) => line);
}

export const observationLogRows = (lines: readonly ObservationLineView[] | undefined, log: readonly BoundaryLogEntry[]): LogRowView[] =>
  [...new Set((lines ?? []).map((line) => line.boundary))].flatMap((boundary): LogRowView[] => {
    const entry = log.find((row) => row.boundary === boundary);
    return entry ? [{ at: { boundary, messageId: entry.context.lastMessageId }, kind: "learned", text: "Noticed something" }] : [];
  });

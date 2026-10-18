import { castMemberName, type BoundaryLogEntry, type EngineState, type NormalizedStory } from "@engine/index";
import type { KnownEntities } from "@engine/codex";
import { holderLabelRows, labelHolders, labelledRelationships, revealEvents } from "@engine/life/labels";
import type { CodexSources } from "./codexView";
import type { CodexEntryView, CodexRowView, LogRowView } from "./gameTypes";

export interface LabelSources {
  story: NormalizedStory;
  state: EngineState;
  boundaryLog: readonly BoundaryLogEntry[];
  castNames: Record<string, string>;
  enabled?: readonly string[];
}

const rowsFor = (sources: LabelSources, member: string, known: KnownEntities): CodexRowView[] => {
  const { story, state, castNames } = sources;
  return holderLabelRows(story, state.blackboard.values, member, known.members, castNames).map((row) => ({
    text: row.text, kind: row.kind, ...(row.at !== null && state.boundary > 0 && row.at === state.boundary ? { fresh: true } : {}),
  }));
};

const memberPage = (sources: LabelSources, member: string, known: KnownEntities): CodexEntryView[] => {
  const rows = rowsFor(sources, member, known);
  const name = sources.castNames[member] ?? castMemberName(sources.story.roster, member);
  return rows.length ? [{ name, fresh: rows.some((row) => row.fresh), facts: [], rows }] : [];
};

export const labelCodexSources = (sources: LabelSources): Pick<CodexSources, "personRows" | "extraPeople"> => (labelledRelationships(sources.story).length ? {
  personRows: (member, known) => rowsFor(sources, member, known),
  extraPeople: (known, paged) => labelHolders(sources.story).filter((member) => !paged.has(member) && known.members.has(member)).flatMap((member) => memberPage(sources, member, known)),
} : {});

export const labelLogRows = (sources: LabelSources): LogRowView[] =>
  revealEvents(sources.story, sources.boundaryLog, sources.state.blackboard.values, sources.enabled ?? [], sources.castNames)
    .map((event) => ({ at: { boundary: event.boundary, messageId: event.messageId }, kind: "reveal", text: event.text }));

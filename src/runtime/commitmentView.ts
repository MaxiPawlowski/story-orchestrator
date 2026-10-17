import { castMemberName } from "@engine/index";
import type { KnownEntities } from "@engine/codex";
import { commitmentHolders, heardCommitmentRows, heldCommitments } from "@engine/life/commitments";
import { labelHolders, labelledRelationships } from "@engine/life/labels";
import type { CodexSources } from "./codexView";
import type { CodexEntryView, CodexRowView } from "./gameTypes";
import { labelCodexSources, type LabelSources } from "./labelView";

type PeopleSources = Pick<CodexSources, "personRows" | "extraPeople">;

const commitmentRows = (sources: LabelSources, member: string, known: KnownEntities): CodexRowView[] => (known.members.has(member)
  ? heardCommitmentRows(sources.story, sources.state.blackboard.values, member).map((row) => ({
    text: row.text, kind: "promised" as const, ...(sources.state.boundary > 0 && row.at === sources.state.boundary ? { fresh: true } : {}),
  })) : []);

export const peopleSources = (sources: LabelSources): PeopleSources => {
  if (!heldCommitments(sources.story).length) return labelCodexSources(sources);
  const labels = labelCodexSources(sources);
  const rows = (member: string, known: KnownEntities): CodexRowView[] => [...(labels.personRows?.(member, known) ?? []), ...commitmentRows(sources, member, known)];
  const holders = [...new Set([...(labelledRelationships(sources.story).length ? labelHolders(sources.story) : []), ...commitmentHolders(sources.story)])];
  const page = (member: string, known: KnownEntities): CodexEntryView[] => {
    const shown = rows(member, known);
    const name = sources.castNames[member] ?? castMemberName(sources.story.roster, member);
    return shown.length ? [{ name, fresh: shown.some((row) => row.fresh), facts: [], rows: shown }] : [];
  };
  return {
    personRows: rows,
    extraPeople: (known, paged) => holders.filter((member) => !paged.has(member) && known.members.has(member)).flatMap((member) => page(member, known)),
  };
};

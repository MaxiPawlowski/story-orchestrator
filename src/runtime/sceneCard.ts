import { RELATIONSHIP_TOWARD_PLAYER, type BoundaryLogEntry, type EngineState, type NormalizedStory, type RosterMember } from "@engine/index";
import { entryName, knownEntities } from "@engine/codex";
import { castMemberName } from "@engine/castNames";
import { factionBand } from "@engine/factionSchema";
import { factionVisible, standingOf } from "@engine/factions/standing";
import { holderLabelRows, labelledRelationships } from "@engine/life/labels";
import { gameLayer } from "@engine/validate/gameLayer";
import { isNarratorMember } from "../image/cast";
import type { CodexView, ScenePresent, SceneView } from "./gameTypes";
import { presentRosterIds } from "./whereabouts";

export interface SceneSources {
  story: NormalizedStory;
  state: EngineState;
  boundaryLog: readonly BoundaryLogEntry[];
  castNames: Record<string, string>;
  enabled?: readonly string[];
  location?: string | null;
  portraits?: Readonly<Record<string, string>>;
  codex?: CodexView;
}

const personName = (story: NormalizedStory, id: string, castNames: Record<string, string>): string => {
  const own = story.codex?.people?.find((entry) => entry.member === id);
  return own ? entryName(story, own, castNames) : castNames[id] ?? castMemberName(story.roster, id);
};

export interface SceneOptions {
  time?: boolean;
  standing?: boolean;
}

const standingLines = (story: NormalizedStory, values: Readonly<Record<string, unknown>>, member: RosterMember): string[] => {
  if (story.display?.standing === false) return [];
  const byId = new Map((story.factions ?? []).map((faction) => [faction.id, faction]));
  return (member.factions ?? []).flatMap((id) => {
    const faction = byId.get(id);
    return faction && factionVisible(faction, values) ? [`${faction.name}: ${factionBand(faction, standingOf(faction, values))}`] : [];
  });
};

export const scenePresent = (sources: SceneSources, options: SceneOptions = {}): ScenePresent[] => {
  const { story, state, castNames } = sources;
  const values = state.blackboard.values;
  const enabled = [...(sources.enabled ?? [])];
  const known = knownEntities(story, values, enabled).members;
  const here = new Set(presentRosterIds(story, values, enabled));
  const pages = new Set((sources.codex?.people ?? []).map((entry) => entry.name));
  const listed = story.roster.filter((member) => here.has(member.id) && known.has(member.id) && !isNarratorMember(member));
  const ids = new Set(listed.map((member) => member.id));
  const labelled = labelledRelationships(story).length > 0;
  return listed.map((member) => {
    const name = personName(story, member.id, castNames);
    const labels = labelled ? holderLabelRows(story, values, member.id, known, castNames, (toward) => toward === RELATIONSHIP_TOWARD_PLAYER || ids.has(toward)).map((row) => row.text) : [];
    const standing = options.standing ? standingLines(story, values, member) : [];
    return {
      name, portrait: sources.portraits?.[member.id] ?? null, page: pages.has(name) ? name : null,
      ...(labels.length ? { labels } : {}), ...(standing.length ? { standing } : {}),
    };
  });
};

export const sceneTime = (sources: SceneSources, shown: boolean): string | null =>
  (shown && sources.story.life?.clock ? gameLayer()?.life.storyTimeRow(sources.story, sources.state.blackboard.values, sources.boundaryLog)?.label ?? null : null);

export const sceneView = (sources: SceneSources, options: SceneOptions = {}): SceneView => ({
  location: sources.location ?? null, time: sceneTime(sources, options.time === true), present: scenePresent(sources, options),
});

export const sceneEmpty = (view: SceneView): boolean => !view.location && !view.time && !view.present.length;

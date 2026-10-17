import type { BoundaryLogEntry, EngineState, NormalizedStoryV2 } from "@engine/index";
import { entryName, knownEntities } from "@engine/codex";
import { castMemberName } from "@engine/castNames";
import { gameLayer } from "@engine/validate/gameLayer";
import { isNarratorMember } from "../image/cast";
import type { CodexView, ScenePresent, SceneView } from "./gameTypes";
import { presentRosterIds } from "./whereabouts";

export interface SceneSources {
  story: NormalizedStoryV2;
  state: EngineState;
  boundaryLog: readonly BoundaryLogEntry[];
  castNames: Record<string, string>;
  enabled?: readonly string[];
  location?: string | null;
  portraits?: Readonly<Record<string, string>>;
  codex?: CodexView;
}

const personName = (story: NormalizedStoryV2, id: string, castNames: Record<string, string>): string => {
  const own = story.codex?.people?.find((entry) => entry.member === id);
  return own ? entryName(story, own, castNames) : castNames[id] ?? castMemberName(story.roster, id);
};

export const scenePresent = (sources: SceneSources): ScenePresent[] => {
  const { story, state, castNames } = sources;
  const values = state.blackboard.values;
  const enabled = [...(sources.enabled ?? [])];
  const known = knownEntities(story, values, enabled).members;
  const here = new Set(presentRosterIds(story, values, enabled));
  const pages = new Set((sources.codex?.people ?? []).map((entry) => entry.name));
  return story.roster.filter((member) => here.has(member.id) && known.has(member.id) && !isNarratorMember(member)).map((member) => {
    const name = personName(story, member.id, castNames);
    return { name, portrait: sources.portraits?.[member.id] ?? null, page: pages.has(name) ? name : null };
  });
};

export const sceneTime = (sources: SceneSources, shown: boolean): string | null =>
  (shown && sources.story.life?.clock ? gameLayer()?.life.storyTimeRow(sources.story, sources.state.blackboard.values, sources.boundaryLog)?.label ?? null : null);

export const sceneView = (sources: SceneSources, showTime: boolean): SceneView => ({
  location: sources.location ?? null, time: sceneTime(sources, showTime), present: scenePresent(sources),
});

export const sceneEmpty = (view: SceneView): boolean => !view.location && !view.time && !view.present.length;

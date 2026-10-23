import type { FeatureWhere } from "@features/registry";
import { AUTHOR_JUDGE_USES, BUILT_JUDGE_USES } from "@judge/settings";
import { judgeProvidersInUse, judgeUseControlId, offeredJudgeUses } from "@judge/useRows";
import { gettingStartedShown, gettingStartedSteps, imagesStepDone, installFindings } from "./repair";
import type { GlobalSettings } from "./settingsModel";
import { castPanelShown, chatPanelsShown, type ChatPanel } from "./chatPanels";
import { livingSaveShown, memorySearchable, sceneTestsShown, shownCarry, shownLife, shownPromises, wardenJudged } from "./surfaceShown";
import type { RuntimeSnapshot } from "./types";

export interface ShowMeHostFacts {
  gpuBroker: boolean | null;
  judgeConfigured: boolean | null;
  stImageSource: boolean | null;
}

export interface ShowMeContext {
  snapshot: RuntimeSnapshot | null;
  authorView: boolean;
  settings: GlobalSettings;
  host: ShowMeHostFacts;
}

type Renders = (context: ShowMeContext) => boolean;

export const UNKNOWN_HOST: ShowMeHostFacts = { gpuBroker: null, judgeConfigured: null, stImageSource: null };

const launcher = (panel: ChatPanel): Renders => ({ snapshot }) => Boolean(snapshot && chatPanelsShown(snapshot).includes(panel));
const ofSnapshot = (shown: (snapshot: RuntimeSnapshot) => unknown): Renders => ({ snapshot }) => Boolean(snapshot && shown(snapshot));
const either = (value: boolean | null): boolean[] => (value === null ? [true, false] : [value]);

const gettingStartedRenders: Renders = ({ snapshot, settings, host }) => {
  if (snapshot && installFindings(snapshot).length) return true;
  const { extraction, judge, image } = settings;
  const memoryModel = extraction.enabled && Boolean(extraction.profileId);
  const judgeReady = judge.enabled ? host.judgeConfigured : false;
  const sourceKnown = !image.enabled || image.backend !== "st" || host.stImageSource !== null;
  const imagesReady = sourceKnown ? imagesStepDone(image, host.stImageSource ? "st" : null) : null;
  return either(judgeReady).every((judged) => either(imagesReady).every((images) =>
    gettingStartedShown(gettingStartedSteps({ memoryModel, judgeReady: judged, imagesReady: images }), settings.help.checklistDismissed)));
};

const judgeUseRows = Object.fromEntries(AUTHOR_JUDGE_USES.map((use): [string, Renders] => [`#${judgeUseControlId(use)}`,
  ({ authorView }) => offeredJudgeUses(BUILT_JUDGE_USES, authorView).includes(use)]));

export const SHOW_ME_CONDITIONAL: Readonly<Record<string, Renders>> = {
  ...judgeUseRows,
  "#so-open-journal": launcher("journal"),
  "#so-open-stat-sheet": launcher("stat-sheet"),
  "#so-open-widgets": launcher("widgets"),
  "#so-open-suggestions": launcher("suggestions"),
  "#so-player-promises": ofSnapshot(shownPromises),
  "#so-carry-heritage": ofSnapshot(shownCarry),
  "#so-living-save": ofSnapshot(livingSaveShown),
  "#so-memory-search": ofSnapshot((snapshot) => memorySearchable(snapshot, false)),
  "#so-character-life": ofSnapshot(shownLife),
  "#so-living-scene-tests": ofSnapshot(sceneTestsShown),
  "#so-cast-scene": ofSnapshot(castPanelShown),
  "#so-judge-expansion-variants": ({ authorView }) => authorView,
  "#so-gpu-broker": ({ host }) => host.gpuBroker === true,
  "#so-judge-local-systemone-local": ({ settings }) => judgeProvidersInUse(settings.judge, wardenJudged(settings.stagecraft)).includes("systemone-local"),
  "#so-getting-started": gettingStartedRenders,
};

export const AUTHOR_VIEW_PLACEHOLDER = "#so-author-view";

export const pageRenders = (where: FeatureWhere, { snapshot, authorView }: ShowMeContext): boolean => {
  const page = where.workspace?.context === "story" ? where.workspace.page : undefined;
  if (page === "play") return Boolean(snapshot?.ready);
  if (page === "author" || page === "review") return where.selector === AUTHOR_VIEW_PLACEHOLDER ? !authorView : authorView;
  return true;
};

export const showMeRenders = (where: FeatureWhere, context: ShowMeContext): boolean =>
  pageRenders(where, context) && (SHOW_ME_CONDITIONAL[where.selector]?.(context) ?? true);

import { useState, type ReactNode } from "react";
import type { FeaturePolicyValue, StoryFeatureId } from "@engine/featurePolicy";
import { FEATURE_CONTROLS, FEATURE_WRITES } from "@runtime/featureControls";
import { readSettingPath, resolveFeatures, settingPatch, type ResolvedFeatures } from "@runtime/featureResolve";
import { waitingCount } from "@runtime/featureStatus";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import { FEATURE_INSTALL_HOMES, WORKSPACE_PAGES } from "@runtime/workspaceRoutes";
import { HARNESS_LABELS } from "@runtime/roleRouteEdits";
import { isHarnessKey, parseHarnessKey } from "@utils/harness";
import { judgeUseActive, type JudgeUseKey } from "@judge/settings";
import { judgeUseControlId } from "@judge/useRows";
import { isArcTemplateName } from "@pacing/index";
import { FeatureList, type FeatureLink } from "@components/ui/FeatureList";
import { SettingRow } from "@components/ui/SettingRow";
import { SegmentedControl } from "@components/ui/SegmentedControl";
import { Button } from "@components/ui/Button";
import { Callout } from "@components/ui/Callout";
import { CheckRow } from "../settings/Field";
import { InnerHarvestNotes } from "../settings/InnerHarvestNotes";
import type { WorkspaceNavigate } from "./WorkspaceShell";
import { StatusText } from "@components/ui/StatusText";

export const FEATURE_JUDGE_USES: Partial<Record<StoryFeatureId, JudgeUseKey[]>> = {
  reading: ["typedExtraction", "stallCheck", "sceneTrigger", "sceneTracker"],
  memory: ["memoryVerify", "memoryPairs", "canonVerify", "canonDraft"],
  continuity: ["houseRules", "wardenLore", "wardenVoice"], agency: ["agencyCheck", "attentionCheck"],
  pacing: ["adversityTrend"], speakers: ["director"], curator: ["curatorFilter"],
  branching: ["divergence", "expansionCritic"], prefetch: ["expansionLookahead"],
  memoryLore: ["loreSelect", "loreExclusive"], illustrations: ["pictureCue"], sprites: ["expressions"],
};

export type FeatureScope = "install" | "chat";

export interface FeaturesPageProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  scope: FeatureScope;
  expanded?: StoryFeatureId;
  navigate: WorkspaceNavigate;
  profileName?: (profileId: string) => string | null;
}

const SHAPES = [{ value: "", label: "Story default" }, { value: "rising", label: "Rising" }, { value: "fall_recovery", label: "Fall, then recovery" },
  { value: "three_act", label: "Three acts" }] as const;

const modelText = (profileId: string | null, profileName?: (profileId: string) => string | null): string => {
  if (!profileId) return "no model chosen";
  if (isHarnessKey(profileId)) {
    const parsed = parseHarnessKey(profileId);
    return parsed ? `${HARNESS_LABELS[parsed.harness]} · ${parsed.model}` : "a harness";
  }
  return profileName?.(profileId) ?? "a missing profile";
};

export const featureMeta = (feature: StoryFeatureId, snapshot: RuntimeSnapshot, profileName?: (profileId: string) => string | null): ReactNode => {
  const role = FEATURE_CONTROLS[feature].role;
  const route = role ? snapshot.roleRoutes?.find((entry) => entry.role === role) : undefined;
  const model = !role ? "No model call" : `Model: ${modelText(route?.profileId ?? null, profileName)}`;
  return <>{model} · Writes {FEATURE_WRITES[feature]}</>;
};

const installDefaults = (): ResolvedFeatures => resolveFeatures(defaultGlobalSettings(), null);

export const FeaturesPage = ({ snapshot, manager, scope, expanded, navigate, profileName }: FeaturesPageProps) => {
  const [failure, setFailure] = useState<string | null>(null);
  const [, refresh] = useState(0);
  const install = scope === "install";
  const resolved = install ? resolveFeatures(getGlobalSettings(), null) : snapshot.features;
  if (!resolved) return <Callout tone="info" title="No story in this chat">Pick a story above to set its features for this chat.</Callout>;
  const defaults = install ? installDefaults() : null;
  const writeInstall = (feature: StoryFeatureId, field: string, value: FeaturePolicyValue | undefined) => {
    const path = FEATURE_CONTROLS[feature].controls.find((control) => control.field === field)?.path;
    if (!path) return;
    const global = getGlobalSettings();
    const patch = settingPatch(global, path, value ?? readSettingPath(defaultGlobalSettings(), path));
    if (feature === "sprites") patch.sprites = { ...(patch.sprites ?? global.sprites), explicit: true };
    setGlobalSettings(patch);
    manager.notify();
    manager.reapplyPromptBlocks();
    refresh((count) => count + 1);
  };
  const override = (feature: StoryFeatureId) => snapshot.featureOverrides?.[feature];
  const writeChat = (feature: StoryFeatureId, field: string, value: FeaturePolicyValue) => {
    setFailure(null);
    const current = override(feature);
    const policy = current && current !== "off" ? current : {};
    if (!manager.setFeatureOverride(feature, { ...policy, [field]: value })) setFailure("The chat changed. Open its story again before editing preferences.");
  };
  const resetChat = (feature: StoryFeatureId, field: string) => {
    const current = override(feature);
    if (!current || current === "off") { manager.setFeatureOverride(feature, null); return; }
    const next = { ...current };
    delete next[field];
    if (field === "enabled") delete next.enabled;
    manager.setFeatureOverride(feature, Object.keys(next).length ? next : null);
  };
  const judgeLinks = (feature: StoryFeatureId): FeatureLink[] => {
    const uses = FEATURE_JUDGE_USES[feature];
    if (!uses?.length) return [];
    const judge = getGlobalSettings().judge;
    const on = uses.filter((use) => judgeUseActive(judge, use)).length;
    return [{ id: `so-feature-${feature}-judge`, label: `Judge: ${on} of ${uses.length} on`,
      onOpen: () => navigate({ context: "orchestrator", page: "judge" }, judgeUseControlId(uses[0])) }];
  };
  const homeElsewhere = (feature: StoryFeatureId): FeatureLink | null => {
    const home = install ? FEATURE_INSTALL_HOMES[feature] : undefined;
    if (!home) return null;
    const label = WORKSPACE_PAGES.orchestrator.find((page) => page.id === home.page)?.label ?? "Settings";
    return { id: `so-feature-${feature}-home`, label: `${resolved[feature].enabled ? "On" : "Off"} · ${label}`,
      onOpen: () => navigate({ context: "orchestrator", page: home.page }, home.control) };
  };
  const extra = (feature: StoryFeatureId): ReactNode => {
    if (feature === "speakers" && install) {
      return <CheckRow id="so-keep-last-question" setting="talk.keepLastQuestion" checked={getGlobalSettings().talk.keepLastQuestion}
        onChange={(on) => { setGlobalSettings({ talk: { keepLastQuestion: on } }); manager.notify(); refresh((count) => count + 1); }} />;
    }
    if (feature === "inner") return <InnerHarvestNotes snapshot={snapshot} />;
    if (feature === "pacing" && !install) {
      const shape = typeof snapshot.pacing.shapeOverride === "string" ? snapshot.pacing.shapeOverride : "";
      return <SettingRow label="Dramatic shape" description="The tension curve this chat follows." scope={shape ? "chat" : "story"}
        changed={Boolean(shape)} onReset={() => manager.setPacingSettings({ shapeOverride: null })} resetLabel="Reset dramatic shape"
        control={<SegmentedControl id="so-shape-override" label="Dramatic shape" size="sm" value={shape} options={SHAPES}
          onChange={(value) => manager.setPacingSettings({ shapeOverride: isArcTemplateName(value) ? value : null })} />} />;
    }
    if (feature === "reading" && !install) {
      return <SettingRow label="Read now" description="Read the chat now instead of waiting for the next read."
        control={<Button id="so-read-now" size="sm" disabled={!resolved.reading.enabled || !snapshot.ready} onClick={() => void manager.runExtractionNow()}>Read now</Button>} />;
    }
    if (feature === "curator" && !install) {
      return <p className="so-setting-desc">Permitted scope: {snapshot.stagecraftScope.length} lorebooks. Review content is available in Author view.</p>;
    }
    return null;
  };
  const notice = (feature: StoryFeatureId): ReactNode => {
    if (install) return null;
    const entry = resolved[feature];
    const waiting = waitingCount(snapshot, feature);
    if (!entry.reenabled && !entry.masterOff && waiting <= 0) return null;
    return <>
      {entry.reenabled && <StatusText tone="warn" role="status">This chat re-enables a feature the story turned off. Its authored limits still apply.</StatusText>}
      {entry.masterOff && <p className="so-setting-desc">Off for every chat. <Button variant="ghost" size="sm" onClick={() => navigate({ context: "orchestrator", page: "features", feature },
        `so-feature-${feature}-enabled`)}>Turn it on in Settings › Features</Button></p>}
      {waiting > 0 && <p className="so-setting-desc">{waiting} changes are waiting for review. Author view reveals their contents.</p>}
    </>;
  };
  return <div className="so-features-page" data-scope={scope}>
    {failure && <Callout tone="error" title="Not saved">{failure}</Callout>}
    <FeatureList scope={install ? "install" : "chat"} resolved={resolved} expanded={expanded}
      disabled={install ? undefined : (feature) => !snapshot.ready || resolved[feature].masterOff}
      changed={defaults ? (feature, field) => resolved[feature].controls[field]?.value !== defaults[feature].controls[field]?.value : undefined}
      onChange={install ? writeInstall : writeChat} onReset={install ? (feature, field) => writeInstall(feature, field, undefined) : resetChat}
      meta={(feature) => featureMeta(feature, snapshot, profileName)} links={judgeLinks} homeElsewhere={homeElsewhere} extra={extra} notice={notice} />
  </div>;
};

export default FeaturesPage;

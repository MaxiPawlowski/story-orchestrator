import { useState } from "react";
import { STORY_FEATURE_IDS, type FeaturePolicyValue, type StoryFeatureId } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import { resolveFeatures, settingPatch } from "@runtime/featureResolve";
import { featureStateWord, featureStatus, waitingCount } from "@runtime/featureStatus";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import { FeaturePolicyFields } from "./FeaturePolicyFields";
import { InnerHarvestNotes } from "../settings/InnerHarvestNotes";
import { JUDGE_USE_COPY, judgeUseActive, type JudgeUseKey } from "@judge/settings";
import { isArcTemplateName } from "@pacing/index";
import type { ResolvedFeatures } from "@runtime/featureResolve";
import { workspaceNavigation } from "@runtime/workspaceNavigation";

const JUDGE_USES: Partial<Record<StoryFeatureId, JudgeUseKey[]>> = {
  reading: ["typedExtraction", "stallCheck", "sceneTrigger", "sceneTracker"],
  memory: ["memoryVerify", "memoryPairs", "canonVerify", "canonDraft"],
  continuity: ["houseRules", "wardenLore", "wardenVoice"], agency: ["agencyCheck", "attentionCheck"],
  pacing: ["adversityTrend"], speakers: ["director"], curator: ["curatorFilter"],
  branching: ["divergence", "expansionCritic"], prefetch: ["expansionLookahead"],
  memoryLore: ["loreSelect", "loreExclusive"], illustrations: ["pictureCue"], sprites: ["expressions"],
};

const FeatureIndex = ({ install, resolved, onSelect }: {
  install: boolean; resolved?: ResolvedFeatures; onSelect: (id: StoryFeatureId) => void;
}) => {
  const [query, setQuery] = useState("");
  return <div className="so-feature-index">
    <h2>{install ? "Feature defaults" : "This story’s features"}</h2>
    <p>{install ? "Defaults apply to every story unless its author or this chat chooses otherwise. Off here is a master switch."
      : "Changes apply only to this chat. Edit the story itself in Studio."}</p>
    <label className="so-control-field" htmlFor="so-feature-search"><span>Find a feature or control</span>
      <input id="so-feature-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {[...new Set(STORY_FEATURE_IDS.map((id) => FEATURE_CONTROLS[id].area))].map((area) => {
      const ids = STORY_FEATURE_IDS.filter((id) => {
        const feature = FEATURE_CONTROLS[id];
        const searchable = `${feature.name} ${feature.description} ${feature.controls.map((control) => control.label).join(" ")}`;
        return feature.area === area && searchable.toLowerCase().includes(query.toLowerCase());
      });
      return !ids.length ? null : <section key={area}><h3>{area}</h3><div className="so-feature-grid">
        {ids.map((id) => <button key={id} className="so-feature-card" onClick={() => onSelect(id)} data-feature={id}>
          <strong>{FEATURE_CONTROLS[id].name}</strong><span>{FEATURE_CONTROLS[id].description}</span>
          <span className="so-feature-state">{featureStateWord(resolved?.[id])}</span>
        </button>)}
      </div></section>;
    })}
  </div>;
};

export const FeaturePages = ({ snapshot, manager, install, selected, onSelect, onConnections }: {
  snapshot: RuntimeSnapshot; manager: RuntimeManager; install: boolean; selected?: StoryFeatureId;
  onSelect: (id: StoryFeatureId | undefined) => void; onConnections: () => void;
}) => {
  const resolved = install ? resolveFeatures(getGlobalSettings(), null) : snapshot.features;
  const [failure, setFailure] = useState<string | null>(null);
  if (!selected) return <FeatureIndex install={install} resolved={resolved} onSelect={onSelect} />;
  if (!resolved) return <p>Open a story chat to configure its features.</p>;
  const config = FEATURE_CONTROLS[selected], feature = resolved[selected];
  const override = snapshot.featureOverrides?.[selected];
  const change = (field: string, value: FeaturePolicyValue) => {
    setFailure(null);
    if (!install) {
      const policy = override && override !== "off" ? override : {};
      if (!manager.setFeatureOverride(selected, { ...policy, [field]: value })) setFailure("The chat changed. Open its story again before editing preferences.");
      return;
    }
    const path = config.controls.find((control) => control.field === field)?.path;
    if (!path) return;
    const global = getGlobalSettings();
    const patch = settingPatch(global, path, value);
    if (selected === "sprites") patch.sprites = { ...(patch.sprites ?? global.sprites), explicit: true };
    setGlobalSettings(patch);
    manager.notify();
    manager.reapplyPromptBlocks();
  };
  const role = config.role && snapshot.roleRoutes?.find((route) => route.role === config.role);
  const waiting = waitingCount(snapshot, selected);
  const calls = (snapshot.modelCalls ?? []).filter((call) => config.role && call.role.split(":")[0] === config.role);
  const status = featureStatus(feature, snapshot, selected, install, waiting).word;
  return <section className="so-feature-detail" data-feature={selected}>
    <button className="st-button secondary" onClick={() => onSelect(undefined)}>← All features</button>
    <h2>{config.name}</h2><p>{config.description}</p>
    <div className="so-feature-status" role="status">{status}</div>
    {feature.reenabled && <p className="so-warning-text" role="status">This chat re-enables a feature the story turned off. Its authored limits still apply.</p>}
    {feature.masterOff && !install && <p>Turn on the install master switch in Orchestrator → Defaults before this chat can use it.</p>}
    <FeaturePolicyFields feature={selected} resolved={feature} disabled={!install && (!snapshot.ready || feature.masterOff)} onChange={change}
      onReset={install ? undefined : (field) => {
        if (!override || override === "off") { manager.setFeatureOverride(selected, null); return; }
        const next = { ...override }; delete next[field];
        manager.setFeatureOverride(selected, Object.keys(next).length ? next : null);
      }} />
    {selected === "inner" && <InnerHarvestNotes snapshot={snapshot} />}
    {!install && override !== undefined && <button className="st-button secondary" onClick={() => manager.setFeatureOverride(selected, null)}>Reset to story/default</button>}
    {!install && selected === "pacing" && <div className="so-control-row">
      <label className="so-control-field" htmlFor="so-shape-override"><span>Dramatic shape</span>
        <select id="so-shape-override" value={typeof snapshot.pacing.shapeOverride === "string" ? snapshot.pacing.shapeOverride : ""}
          onChange={(event) => manager.setPacingSettings({ shapeOverride: isArcTemplateName(event.target.value) ? event.target.value : null })}>
          <option value="">Use story default</option><option value="rising">Rising to climax</option>
          <option value="fall_recovery">Fall then recovery</option><option value="three_act">Three act</option>
        </select>
      </label><span className="so-source-chip">{snapshot.pacing.shapeOverride ? "This chat" : "Story"}</span>
      <button className="st-button secondary" onClick={() => manager.setPacingSettings({ shapeOverride: null })}>Reset dramatic shape</button>
    </div>}
    <p className="so-setting-timing">Applies to future work. Already-running requests finish under their existing run ownership; changes refresh the next prompt.</p>
    {failure && <p role="alert">{failure}</p>}
    {config.role && <div className="so-feature-uses"><h3>Model and connections</h3>
      <p>{config.name}: {role?.state === "fallback" ? "Inherited model" : role?.state ?? "Not checked"}</p>
      <button className="st-button secondary" onClick={onConnections}>Configure model connections</button>
    </div>}
    {Boolean(JUDGE_USES[selected]?.length) && <section><h3>Judge checks</h3>
      <p>These install-wide checks support this feature. Their settings apply to every chat.</p>
      {JUDGE_USES[selected]?.map((use) => <div className="so-control-row" key={use}>
        <label className="so-control-toggle"><input type="checkbox" checked={getGlobalSettings().judge.uses[use]}
          onChange={(event) => {
            const judge = getGlobalSettings().judge;
            setGlobalSettings({ judge: { ...judge, uses: { ...judge.uses, [use]: event.target.checked } } });
            manager.notify();
          }} />{JUDGE_USE_COPY[use].label}</label>
        <span className="so-source-chip">Install</span>
        <span>{judgeUseActive(getGlobalSettings().judge, use) ? "Enabled" : "Off or waiting for its prerequisite"}</span>
      </div>)}
      <button className="st-button secondary" onClick={onConnections}>Judge connections and measurements</button>
    </section>}
    {!install && selected === "reading" && <button className="st-button secondary" disabled={!feature.enabled || !snapshot.ready} onClick={() => void manager.runExtractionNow()}>Read now</button>}
    {!install && selected === "curator" && <p>Permitted scope: {snapshot.stagecraftScope.length} lorebooks. Review content is available in Author view.</p>}
    {!install && waiting > 0 && <div><p>{waiting} changes are waiting for review. Author view reveals their contents.</p>
      <button className="st-button secondary" onClick={() => workspaceNavigation.open({ context: "story", page: "review" })}>Open review</button>
    </div>}
    <details><summary>Advanced setup</summary><p>Model routes, service configuration, budgets and capability measurements are install-wide.</p>
      <button className="st-button secondary" onClick={onConnections}>Open install setup</button>
    </details>
    {!install && config.role && <p>Recent activity: {calls.length} recorded model calls for this feature.</p>}
    {!install && snapshot.ui.authorView && calls.length > 0 && <details><summary>Recent activity details</summary>
      <ul>{calls.slice(-10)
        .map((call, index) => <li key={index}><pre>{JSON.stringify(call, null, 2)}</pre></li>)}</ul>
    </details>}
  </section>;
};

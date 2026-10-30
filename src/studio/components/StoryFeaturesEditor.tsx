import type { FeaturePolicyValue, StoryFeatureId } from "@engine/featurePolicy";
import { resolveFeatures } from "@runtime/featureResolve";
import { getGlobalSettings } from "@runtime/settingsStore";
import { FeatureList } from "@components/ui/FeatureList";
import { useDraftStore } from "../draft";
import { setFeaturePolicy } from "../mutations";
import CodexEditor from "./CodexEditor";
import ObservationsEditor from "./ObservationsEditor";

export default function StoryFeaturesEditor() {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const resolved = resolveFeatures(getGlobalSettings(), draft);
  const policyOf = (id: StoryFeatureId) => {
    const policy = useDraftStore.getState().draft.features?.[id];
    return policy === "off" ? { enabled: false } : policy ?? {};
  };
  const change = (id: StoryFeatureId, field: string, value: FeaturePolicyValue) => mutate((current) => setFeaturePolicy(current, id, { ...policyOf(id), [field]: value }));
  const reset = (id: StoryFeatureId, field: string) => {
    const next: Record<string, FeaturePolicyValue> = { ...policyOf(id) };
    delete next[field];
    mutate((current) => setFeaturePolicy(current, id, Object.keys(next).length ? next : null));
  };
  const changed = (id: StoryFeatureId, field: string) => {
    const policy = draft.features?.[id];
    if (policy === "off") return field === "enabled";
    return policy?.[field] !== undefined;
  };
  return <section className="flex flex-col gap-3" data-so="story-features">
    <p className="m-0 text-sm">These choices travel with this story. Players may override them for one chat; an install master-off still wins.
      Scope, character plans, chapter structure and other authored content remain in their own editors.</p>
    <FeatureList scope="story" resolved={resolved} changed={changed} onChange={change} onReset={reset}
      notice={(id) => (resolved[id].masterOff ? <span className="text-xs st-muted">Currently off on this install. The authored policy still travels with the story.</span> : null)} />
    <CodexEditor />
    <ObservationsEditor />
  </section>;
}

import { FEATURE_POLICY_FIELDS, STORY_FEATURE_IDS, type PolicyField } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import { resolveFeatures } from "@runtime/featureResolve";
import { getGlobalSettings } from "@runtime/settingsStore";
import { useDraftStore } from "../draft";
import { setFeaturePolicy } from "../mutations";
import CodexEditor from "./CodexEditor";
import ObservationsEditor from "./ObservationsEditor";

export default function StoryFeaturesEditor() {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const resolved = resolveFeatures(getGlobalSettings(), draft);
  return <section className="flex flex-col gap-3"><h3>Story feature policies</h3>
    <p>These choices travel with this story. Players may override them for one chat; an install master-off still wins.
      Scope, character plans, chapter structure and other authored content remain in their own editors.</p>
    {STORY_FEATURE_IDS.map((id) => {
      const feature = FEATURE_CONTROLS[id], policy = draft.features?.[id];
      return <details key={id} className="st-subpanel p-3"><summary>{feature.name} · {policy === undefined ? "Default" : policy === "off" ? "Off" : "Customized"}</summary>
        <p>{feature.description}</p>
        <label className="flex flex-col gap-2">Story policy
          <select aria-label={`${feature.name} policy`} value={policy === undefined ? "inherit" : policy === "off" ? "off" : "tune"}
            onChange={(event) => mutate((current) => setFeaturePolicy(current, id, event.target.value === "inherit" ? null
              : event.target.value === "off" ? "off" : { enabled: true }))}>
            <option value="inherit">Use install defaults</option><option value="tune">Customize this story</option><option value="off">Decline this feature</option>
          </select>
        </label>
        {policy && policy !== "off" && feature.controls.map((control) => {
          const spec: PolicyField = (FEATURE_POLICY_FIELDS[id] as Record<string, PolicyField>)[control.field];
          const value = policy[control.field] ?? resolved[id].controls[control.field].value;
          const change = (value: boolean | number | string) => mutate((current) => setFeaturePolicy(current, id, { ...policy, [control.field]: value }));
          return <label key={control.field} className="flex flex-col gap-2 py-2">{control.label}
            {spec.kind === "boolean" ? <input aria-label={`${feature.name}: ${control.label}`} type="checkbox" checked={value === true}
              onChange={(event) => change(event.target.checked)} /> : spec.kind === "choice"
              ? <select aria-label={`${feature.name}: ${control.label}`} value={String(value)} onChange={(event) => change(event.target.value)}>
                {spec.options?.map((value) => <option key={value}>{value}</option>)}
              </select> : <input aria-label={`${feature.name}: ${control.label}`} type="number" min={spec.min} max={spec.max} value={Number(value)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (event.target.value && Number.isSafeInteger(value) && value >= (spec.min ?? 0) && value <= (spec.max ?? Infinity)) change(value);
                }} />}
          </label>;
        })}
        {resolved[id].masterOff && <p>Currently off on this install. The authored policy still travels with the story.</p>}
      </details>;
    })}
    <CodexEditor />
    <ObservationsEditor />
  </section>;
}

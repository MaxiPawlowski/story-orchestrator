import { FEATURE_POLICY_FIELDS, type FeaturePolicyValue, type PolicyField, type StoryFeatureId } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import type { ResolvedFeature } from "@runtime/featureResolve";

const LABELS: Record<string, string> = {
  auto: "Automatically apply eligible changes", review: "Review before applying", off: "Off",
  next: "Next speaker", top2: "Two likely speakers", vn: "With Visual Novel mode", always: "Always",
  manual: "Only when requested", story: "Story moments", everyN: "Every few replies and story moments", tool: "Model requests",
};

export const PolicyInput = ({ id, label, spec, value, disabled, optionLabels, onChange }: {
  id: string; label: string; spec: PolicyField; value: FeaturePolicyValue; disabled?: boolean; onChange: (value: FeaturePolicyValue) => void;
  optionLabels?: Record<string, string>;
}) => {
  if (spec.kind === "boolean") return <label className="so-control-toggle" htmlFor={id}>
    <input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}
  </label>;
  return <label className="so-control-field" htmlFor={id}><span>{label}</span>
    {spec.kind === "number" ? <input id={id} type="number" min={spec.min} max={spec.max} step={1} value={Number(value)} disabled={disabled}
      onChange={(event) => {
        const number = Number(event.target.value);
        if (event.target.value !== "" && Number.isSafeInteger(number) && number >= (spec.min ?? 0) && number <= (spec.max ?? Infinity)) onChange(number);
      }} />
      : <select id={id} value={String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {spec.options?.map((option) => <option key={option} value={option}>{optionLabels?.[option] ?? LABELS[option] ?? option}</option>)}
      </select>}
  </label>;
};

export const FeaturePolicyFields = ({ feature, resolved, disabled, onChange, onReset }: {
  feature: StoryFeatureId; resolved: ResolvedFeature; disabled?: boolean; onChange: (field: string, value: FeaturePolicyValue) => void;
  onReset?: (field: string) => void;
}) => <div className="so-feature-controls">
  {FEATURE_CONTROLS[feature].controls.map((control) => {
    const spec: PolicyField = (FEATURE_POLICY_FIELDS[feature] as Record<string, PolicyField>)[control.field];
    const current = resolved.controls[control.field];
    return <div key={control.field} className="so-control-row">
      <PolicyInput id={`so-feature-${feature}-${control.field}`} label={control.label} spec={spec} value={current.value}
        optionLabels={feature === "curator" && control.field === "acceptMode" ? { off: "Preview only" } : undefined}
        disabled={disabled || (control.field !== "enabled" && !resolved.enabled)} onChange={(value) => onChange(control.field, value)} />
      <span className="so-source-chip" data-source={current.source}>{current.source === "install" ? "Default" : current.source === "chat" ? "This chat" : "Story"}</span>
      {current.source === "chat" && onReset && <button className="st-button secondary" aria-label={`Reset ${control.label} to story/default`}
        onClick={() => onReset(control.field)}>Reset</button>}
    </div>;
  })}
</div>;

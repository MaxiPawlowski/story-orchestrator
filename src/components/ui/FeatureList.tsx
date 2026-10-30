import { useState, type ReactNode } from "react";
import { FEATURE_POLICY_FIELDS, STORY_FEATURE_IDS, type FeaturePolicyValue, type PolicyField, type StoryFeatureId } from "@engine/featurePolicy";
import { FEATURE_CONTROLS, type FeatureControl } from "@runtime/featureControls";
import type { FeatureSource, ResolvedFeature, ResolvedFeatures } from "@runtime/featureResolve";
import { SettingRow, type SettingScope } from "./SettingRow";
import { Switch } from "./Switch";
import { SegmentedControl } from "./SegmentedControl";
import { Select, TextInput } from "./Field";
import { Button } from "./Button";
import { SearchField } from "./SearchField";
import { EmptyState } from "./EmptyState";
import { optionLabel, settingDescription } from "./featureCopy";

export type FeatureListScope = "install" | "story" | "chat";
export type FeatureFilter = "all" | "on" | "off" | "changed";

export interface FeatureLink {
  label: string;
  onOpen: () => void;
  id?: string;
}

export interface FeatureListProps {
  scope: FeatureListScope;
  resolved: ResolvedFeatures;
  ids?: readonly StoryFeatureId[];
  expanded?: StoryFeatureId;
  disabled?: (feature: StoryFeatureId) => boolean;
  changed?: (feature: StoryFeatureId, field: string) => boolean;
  onChange: (feature: StoryFeatureId, field: string, value: FeaturePolicyValue) => void;
  onReset?: (feature: StoryFeatureId, field: string) => void;
  meta?: (feature: StoryFeatureId) => ReactNode;
  links?: (feature: StoryFeatureId) => FeatureLink[];
  homeElsewhere?: (feature: StoryFeatureId) => FeatureLink | null;
  extra?: (feature: StoryFeatureId) => ReactNode;
  notice?: (feature: StoryFeatureId) => ReactNode;
  filterable?: boolean;
}

const SOURCE_SCOPE: Record<FeatureSource, SettingScope> = { install: "default", story: "story", chat: "chat", device: "device" };
const SCOPE_SOURCE: Record<FeatureListScope, FeatureSource> = { install: "install", story: "story", chat: "chat" };
const AREAS = [...new Set(STORY_FEATURE_IDS.map((id) => FEATURE_CONTROLS[id].area))];

export const featureControlId = (feature: StoryFeatureId, field: string): string => `so-feature-${feature}-${field}`;

const specOf = (feature: StoryFeatureId, field: string, value: FeaturePolicyValue): PolicyField | null =>
  (FEATURE_POLICY_FIELDS[feature] as Partial<Record<string, PolicyField>>)[field] ?? (typeof value === "boolean" ? { kind: "boolean" } : null);

const ControlInput = ({ feature, control, value, disabled, describedBy, onChange }: {
  feature: StoryFeatureId; control: FeatureControl; value: FeaturePolicyValue; disabled: boolean; describedBy?: string;
  onChange: (value: FeaturePolicyValue) => void;
}) => {
  const id = featureControlId(feature, control.field);
  const spec = specOf(feature, control.field, value);
  if (!spec) return null;
  if (spec.kind === "boolean") return <Switch id={id} checked={value === true} disabled={disabled} describedBy={describedBy} onChange={onChange} />;
  if (spec.kind === "number") {
    return <TextInput id={id} type="number" size="xs" min={spec.min} max={spec.max} step={1} value={Number(value)} disabled={disabled} aria-describedby={describedBy}
      onChange={(event) => {
        const number = Number(event.target.value);
        if (event.target.value !== "" && Number.isSafeInteger(number) && number >= (spec.min ?? 0) && number <= (spec.max ?? Infinity)) onChange(number);
      }} />;
  }
  const options = spec.options ?? [];
  if (options.length <= 4) {
    return <SegmentedControl id={id} label={control.label} size="sm" value={String(value)} disabled={disabled}
      options={options.map((option) => ({ value: option, label: optionLabel(feature, control.field, option) }))} onChange={onChange} />;
  }
  return <Select id={id} size="md" value={String(value)} disabled={disabled} aria-describedby={describedBy} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option} value={option}>{optionLabel(feature, control.field, option)}</option>)}
  </Select>;
};

const matches = (feature: StoryFeatureId, query: string): boolean => {
  if (!query) return true;
  const config = FEATURE_CONTROLS[feature];
  const text = `${config.name} ${config.description} ${config.controls.map((control) => control.label).join(" ")}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
};

export const FeatureList = ({
  scope, resolved, ids = STORY_FEATURE_IDS, expanded, disabled, changed, onChange, onReset, meta, links, homeElsewhere, extra, notice, filterable = true,
}: FeatureListProps) => {
  const [open, setOpen] = useState<ReadonlySet<StoryFeatureId>>(() => new Set(expanded ? [expanded] : []));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FeatureFilter>("all");
  const isChanged = (feature: StoryFeatureId, field: string, entry: ResolvedFeature) =>
    changed ? changed(feature, field) : entry.controls[field]?.source === SCOPE_SOURCE[scope];
  const anyChanged = (feature: StoryFeatureId) => FEATURE_CONTROLS[feature].controls.some((control) => isChanged(feature, control.field, resolved[feature]));
  const shown = ids.filter((feature) => matches(feature, query) && (filter === "all" || (filter === "on" ? resolved[feature].enabled
    : filter === "off" ? !resolved[feature].enabled : anyChanged(feature))));
  const toggle = (feature: StoryFeatureId) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(feature)) next.delete(feature); else next.add(feature);
    return next;
  });
  const scopeChip = (source: FeatureSource): SettingScope | undefined => scope === "install" ? undefined : SOURCE_SCOPE[source];
  const row = (feature: StoryFeatureId) => {
    const config = FEATURE_CONTROLS[feature];
    const entry = resolved[feature];
    const locked = disabled?.(feature) ?? false;
    const home = homeElsewhere?.(feature) ?? null;
    const [master, ...rest] = config.controls;
    const more = home ? [] : rest;
    const extraBody = extra?.(feature);
    const expandable = more.length > 0 || Boolean(extraBody);
    const expandedNow = open.has(feature) && expandable;
    const noticeBody = notice?.(feature);
    const rowLinks = links?.(feature) ?? [];
    const enabledControl = entry.controls[master.field];
    const description = <>
      <span>{config.description}</span>
      {meta && <span className="so-feature-meta" data-so="feature-meta">{meta(feature)}</span>}
    </>;
    return <div key={feature} className="so-feature-row" data-so="feature-row" data-feature={feature} data-state={entry.enabled ? "on" : "off"}
      data-expanded={expandedNow || undefined}>
      <SettingRow label={config.name} htmlFor={home ? undefined : featureControlId(feature, master.field)} description={description}
        scope={scopeChip(enabledControl.source)} changed={!home && isChanged(feature, master.field, entry)} onReset={onReset && (() => onReset(feature, master.field))}
        resetLabel={`Reset ${config.name}`}
        control={(describedBy) => <>
          {rowLinks.map((link) => <Button key={link.label} id={link.id} variant="ghost" size="sm" className="so-feature-link" onClick={link.onOpen}>{link.label}</Button>)}
          {expandable && <Button id={`so-feature-${feature}-toggle`} variant="ghost" size="sm" icon={expandedNow ? "fa-chevron-up" : "fa-chevron-down"}
            aria-expanded={expandedNow} aria-controls={`so-feature-${feature}-more`} onClick={() => toggle(feature)}>
            {expandedNow ? "Less" : more.length ? `${more.length} more` : "More"}</Button>}
          {home ? <Button id={home.id} variant="ghost" size="sm" icon="fa-arrow-right" onClick={home.onOpen}>{home.label}</Button>
            : <ControlInput feature={feature} control={master} value={enabledControl.value} disabled={locked} describedBy={describedBy}
              onChange={(value) => onChange(feature, master.field, value)} />}
        </>} />
      {noticeBody && <div className="so-feature-notice">{noticeBody}</div>}
      {expandedNow && <div id={`so-feature-${feature}-more`} className="so-feature-more" data-so="feature-more">
        {more.map((control) => {
          const current = entry.controls[control.field];
          const copy = settingDescription(control.path);
          return <SettingRow key={control.field} label={control.label} htmlFor={featureControlId(feature, control.field)}
            description={copy?.text}
            scope={scopeChip(current.source)} changed={isChanged(feature, control.field, entry)} onReset={onReset && (() => onReset(feature, control.field))}
            resetLabel={`Reset ${control.label}`}
            control={(describedBy) => <ControlInput feature={feature} control={control} value={current.value} describedBy={describedBy}
              disabled={locked || !entry.enabled} onChange={(value) => onChange(feature, control.field, value)} />} />;
        })}
        {extraBody}
      </div>}
    </div>;
  };
  return <div className="so-feature-list" data-so="feature-list" data-scope={scope}>
    {filterable && <div className="so-feature-filter">
      <SearchField id="so-feature-filter" label="Filter features" value={query} onChange={setQuery} />
      <SegmentedControl data-so="feature-filter-state" label="Show" size="sm" value={filter} onChange={setFilter}
        options={[{ value: "all", label: "All" }, { value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "changed", label: "Changed" }]} />
    </div>}
    {!shown.length && <EmptyState icon="fa-filter-circle-xmark" title="No feature matches">Clear the filter to see every feature.</EmptyState>}
    {AREAS.map((area) => {
      const rows = shown.filter((feature) => FEATURE_CONTROLS[feature].area === area);
      return rows.length ? <section key={area} className="so-feature-group" data-area={area}>
        <h3 className="so-feature-group-title">{area}</h3>
        {rows.map(row)}
      </section> : null;
    })}
  </div>;
};

export default FeatureList;

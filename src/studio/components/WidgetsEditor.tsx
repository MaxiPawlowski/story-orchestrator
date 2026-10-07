import React from "react";
import { WIDGET_ACCENTS, WIDGET_AUDIENCES, WIDGET_ICONS, WIDGET_KINDS, type StoryWidget, type WidgetBind, type WidgetOptions } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { addWidget, removeWidget, updateWidget } from "../gameMutations";
import { JsonField, OptionalGate, TextField } from "./GameFields";

const HELP = "A story panel shows qualities, quests, the path or a clock. A player panel may bind only public qualities; an author panel shows only in Author view.";

interface ChoiceProps<T extends string> {
  label: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (value: T | undefined) => void;
  blank?: boolean;
}

const Choice = <T extends string>({ label, value, options, onChange, blank }: ChoiceProps<T>) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-xs st-muted">{label}</span>
    <select className="text_pole st-input" aria-label={label} value={value ?? ""} onChange={(event) => onChange((event.target.value || undefined) as T | undefined)}>
      {blank && <option value="">(none)</option>}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);

const WidgetRow = ({ widget }: { widget: StoryWidget }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const patch = (value: Partial<Omit<StoryWidget, "id">>) => mutate((current) => updateWidget(current, widget.id, value));
  const name = widget.id;
  return (
    <div data-so="widget-row" data-widget={widget.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{widget.id}</span>
        <TextField label={`${name} title`} value={widget.title} onChange={(title) => patch({ title })} />
        <Choice label={`${name} kind`} value={widget.kind} options={WIDGET_KINDS} onChange={(kind) => kind && patch({ kind })} />
        <Choice label={`${name} audience`} value={widget.audience} options={WIDGET_AUDIENCES} onChange={(audience) => audience && patch({ audience })} />
        <Choice label={`${name} accent`} value={widget.accent} options={WIDGET_ACCENTS} blank onChange={(accent) => patch({ accent })} />
        <Choice label={`${name} icon`} value={widget.icon} options={WIDGET_ICONS} blank onChange={(icon) => patch({ icon })} />
        <button type="button" className="st-button danger" aria-label={`Remove panel ${name}`} onClick={() => mutate((current) => removeWidget(current, widget.id))}>×</button>
      </div>
      <JsonField label={`${name} bind`} hint='{"quality"}, {"qualities": []}, {"group"}, {"quests": true}, {"path": true}, {"arcs": true}' value={widget.bind}
        onChange={(bind) => patch({ bind: bind as WidgetBind | undefined })} />
      <JsonField label={`${name} options`} hint='{"limit"?, "closed"?}' value={widget.options} onChange={(options) => patch({ options: options as WidgetOptions | undefined })} />
      <OptionalGate label={`${name} visible when`} gate={widget.visible_when} qualities={qualities} onChange={(visible_when) => patch({ visible_when })} />
    </div>
  );
};

const WidgetsEditor: React.FC = () => {
  const widgets = useDraftStore((state) => state.draft.widgets) ?? [];
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div data-so="widgets-editor" className="st-subpanel flex flex-col gap-2 p-3">
      <div className="text-sm font-medium">Story panels<HelpTooltip title={HELP} /></div>
      {!widgets.length && <div className="text-xs st-muted">None. Players still get a Journal and a Stat sheet from your quests and public qualities.</div>}
      {widgets.map((widget) => <WidgetRow key={widget.id} widget={widget} />)}
      <button type="button" className="st-button secondary self-start" onClick={() => mutate((current) => addWidget(current))}>+ Panel</button>
    </div>
  );
};

export default WidgetsEditor;

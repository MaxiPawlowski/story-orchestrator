import { useId, type ReactNode } from "react";
import HelpTooltip from "@components/studio/HelpTooltip";
import { SettingRow, type SettingScope } from "@components/ui/SettingRow";
import { Switch } from "@components/ui/Switch";
import { Section } from "@components/ui/Section";
import { settingCopy, type SettingCopyKey } from "@features/settingsCopy";

export interface CheckRowProps {
  id?: string;
  setting?: SettingCopyKey;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  label?: ReactNode;
  help?: string;
  className?: string;
  description?: ReactNode;
  scope?: SettingScope;
  changed?: boolean;
  onReset?: () => void;
  kind?: "switch" | "checkbox";
}

const resolve = (setting: SettingCopyKey | undefined, label: ReactNode | undefined, help: string | undefined) => {
  const copy = setting ? settingCopy(setting) : null;
  return { text: label ?? copy?.label ?? "", tip: help ?? copy?.help };
};

export const CheckRow = ({ id, setting, checked, disabled, onChange, label, help, description, scope, changed, onReset, kind = "switch" }: CheckRowProps) => {
  const fallback = useId();
  const controlId = id ?? fallback;
  const { text, tip } = resolve(setting, label, help);
  if (kind === "checkbox") {
    return (
      <span className="so-check">
        <label className="inline-flex items-center gap-2">
          <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
          <span>{text}</span>
        </label>
        {tip && <HelpTooltip title={tip} />}
      </span>
    );
  }
  return (
    <SettingRow label={text} htmlFor={controlId} help={tip} description={description} scope={scope} changed={changed} onReset={onReset}
      control={(describedBy) => <Switch id={controlId} checked={checked} disabled={disabled} describedBy={describedBy} onChange={onChange} />} />
  );
};

export const FieldLabel = ({ htmlFor, setting, label, help }: { htmlFor: string; setting?: SettingCopyKey; label?: ReactNode; help?: string }) => {
  const { text, tip } = resolve(setting, label, help);
  return (
    <div className="flex items-center gap-1">
      <label htmlFor={htmlFor}>{text}</label>
      {tip && <HelpTooltip title={tip} />}
    </div>
  );
};

export const Advanced = ({ id, label = "Advanced", children }: { id?: string; label?: string; children: ReactNode }) => (
  <Section collapsible id={id} data-so="settings-advanced" title={label}>{children}</Section>
);

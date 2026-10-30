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
  extra?: ReactNode;
}

const resolve = (setting: SettingCopyKey | undefined, label: ReactNode | undefined, help: string | undefined) => {
  const copy = setting ? settingCopy(setting) : null;
  return { text: label ?? copy?.label ?? "", tip: help ?? copy?.help };
};

const firstSentence = (text: string): string => /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;

export const HelpText = ({ text, id }: { text: string | undefined; id?: string }) => {
  if (!text) return null;
  const short = firstSentence(text);
  return <span id={id} title={short === text ? undefined : text}>{short}</span>;
};

export const CheckRow = ({ id, setting, checked, disabled, onChange, label, help, description, scope, changed, onReset, kind = "switch", extra }: CheckRowProps) => {
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
    <SettingRow label={text} htmlFor={controlId} description={description ?? (tip ? <HelpText text={tip} /> : undefined)} scope={scope} changed={changed} onReset={onReset}
      control={(describedBy) => <>{extra}<Switch id={controlId} checked={checked} disabled={disabled} describedBy={describedBy} onChange={onChange} /></>} />
  );
};

export const FieldLabel = ({ htmlFor, setting, label, help }: { htmlFor: string; setting?: SettingCopyKey; label?: ReactNode; help?: string }) => {
  const { text, tip } = resolve(setting, label, help);
  return (
    <div className="so-field-label">
      <label htmlFor={htmlFor} className="so-setting-label">{text}</label>
      {tip && <p className="so-setting-desc"><HelpText text={tip} /></p>}
    </div>
  );
};

export const Advanced = ({ id, label = "Advanced", children }: { id?: string; label?: string; children: ReactNode }) => (
  <Section collapsible id={id} data-so="settings-advanced" title={label}>{children}</Section>
);

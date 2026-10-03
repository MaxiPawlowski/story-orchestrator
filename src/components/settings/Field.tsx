import type { ReactNode } from "react";
import HelpTooltip from "@components/studio/HelpTooltip";
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
}

const resolve = (setting: SettingCopyKey | undefined, label: ReactNode | undefined, help: string | undefined) => {
  const copy = setting ? settingCopy(setting) : null;
  return { text: label ?? copy?.label ?? "", tip: help ?? copy?.help };
};

export const CheckRow = ({ id, setting, checked, disabled, onChange, label, help, className = "text-sm" }: CheckRowProps) => {
  const { text, tip } = resolve(setting, label, help);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="flex items-center gap-2">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <span>{text}</span>
      </label>
      {tip && <HelpTooltip title={tip} />}
    </div>
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
  <details id={id} data-so="settings-advanced" className="text-sm">
    <summary className="cursor-pointer opacity-80">{label}</summary>
    <div className="flex flex-col gap-2 pt-2">{children}</div>
  </details>
);

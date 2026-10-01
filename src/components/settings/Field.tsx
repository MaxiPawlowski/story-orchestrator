import type { ReactNode } from "react";
import HelpTooltip from "@components/studio/HelpTooltip";

export interface CheckRowProps {
  id?: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
  label: ReactNode;
  help?: string;
  className?: string;
}

export const CheckRow = ({ id, checked, disabled, onChange, label, help, className = "text-sm" }: CheckRowProps) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <label className="flex items-center gap-2">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
    {help && <HelpTooltip title={help} />}
  </div>
);

export const FieldLabel = ({ htmlFor, label, help }: { htmlFor: string; label: ReactNode; help?: string }) => (
  <div className="flex items-center gap-1">
    <label htmlFor={htmlFor}>{label}</label>
    {help && <HelpTooltip title={help} />}
  </div>
);

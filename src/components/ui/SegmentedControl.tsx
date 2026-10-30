import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";
import { roveWithin } from "./rovingKeys";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: string;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  id?: string;
  label?: string;
  labelledBy?: string;
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "data-so"?: string;
}

export function SegmentedControl<T extends string>({ id, label, labelledBy, value, options, onChange, disabled, size = "md", className, "data-so": dataSo }: SegmentedControlProps<T>) {
  const selected = options.some((option) => option.value === value) ? value : options[0]?.value;
  return (
    <div id={id} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} aria-disabled={disabled || undefined} data-so={dataSo} data-size={size}
      className={cx("so-segmented", className)} onKeyDown={(event) => { roveWithin(event, "[role=radio]"); }}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === selected} data-value={option.value} title={option.title}
          tabIndex={option.value === selected ? 0 : -1} disabled={disabled || option.disabled}
          onClick={() => { if (option.value !== value) onChange(option.value); }}>
          {option.icon && <Icon name={option.icon} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedControl;

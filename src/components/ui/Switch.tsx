import { cx } from "./cx";

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  className?: string;
  "data-so"?: string;
}

export const Switch = ({ id, checked, onChange, disabled, label, labelledBy, describedBy, className, "data-so": dataSo }: SwitchProps) => (
  <button type="button" role="switch" id={id} data-so={dataSo} aria-checked={checked} aria-label={label} aria-labelledby={labelledBy}
    aria-describedby={describedBy} disabled={disabled} className={cx("so-switch", className)} onClick={() => onChange(!checked)}>
    <span className="so-switch-thumb" aria-hidden="true" />
  </button>
);

export default Switch;

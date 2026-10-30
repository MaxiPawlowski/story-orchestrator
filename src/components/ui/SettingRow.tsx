import { useId, type ReactNode } from "react";
import HelpTooltip from "@components/studio/HelpTooltip";
import { cx } from "./cx";
import { Badge } from "./Badge";
import { IconButton } from "./IconButton";

export type SettingScope = "default" | "story" | "chat" | "device";

export const SETTING_SCOPE_LABELS: Record<SettingScope, string> = { default: "Default", story: "Story", chat: "This chat", device: "This device" };

export interface SettingRowProps {
  label: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  control?: ReactNode | ((describedBy: string | undefined) => ReactNode);
  children?: ReactNode;
  scope?: SettingScope;
  changed?: boolean;
  onReset?: () => void;
  resetLabel?: string;
  help?: string;
  helpHref?: string;
  id?: string;
  className?: string;
  "data-so"?: string;
}

export const SettingRow = ({
  label, htmlFor, description, control, children, scope, changed = false, onReset, resetLabel, help, helpHref, id, className, "data-so": dataSo = "setting-row",
}: SettingRowProps) => {
  const descriptionId = useId();
  const named = typeof label === "string" ? label : "this setting";
  return (
    <div id={id} data-so={dataSo} data-scope={scope} data-changed={changed || undefined} className={cx("so-setting", className)}>
      <div className="so-setting-text">
        <div className="so-setting-head">
          {htmlFor ? <label htmlFor={htmlFor} className="so-setting-label">{label}</label> : <span className="so-setting-label">{label}</span>}
          {help && <HelpTooltip title={help} href={helpHref} />}
          {scope && <Badge data-so="setting-scope" className="so-setting-scope">{SETTING_SCOPE_LABELS[scope]}</Badge>}
        </div>
        {description && <p id={descriptionId} className="so-setting-desc">{description}</p>}
      </div>
      <div className="so-setting-control">
        {typeof control === "function" ? control(description ? descriptionId : undefined) : control ?? children}
        {changed && onReset && <IconButton data-so="setting-reset" size="sm" icon="fa-rotate-left" label={resetLabel ?? `Reset ${named}`} onClick={onReset} />}
      </div>
    </div>
  );
};

export default SettingRow;

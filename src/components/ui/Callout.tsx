import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";
import { TONE_ICON, type Tone } from "./Badge";

export interface CalloutProps {
  tone?: Tone;
  title?: ReactNode;
  icon?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status" | "note";
  id?: string;
  className?: string;
  "data-so"?: string;
}

export const Callout = ({ tone = "info", title, icon, actions, children, className, ...rest }: CalloutProps) => {
  const glyph = icon === undefined ? TONE_ICON[tone] ?? "fa-circle-info" : icon;
  return (
    <div {...rest} className={cx("so-callout", className)} data-tone={tone}>
      {glyph ? <Icon name={glyph} /> : <span />}
      <div className="so-callout-body">
        {title && <p className="so-callout-title">{title}</p>}
        {children}
        {actions && <div className="so-actions">{actions}</div>}
      </div>
    </div>
  );
};

export default Callout;

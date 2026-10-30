import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";
import { TONE_ICON, type Tone } from "./Badge";

export interface StatusTextProps {
  tone?: Tone;
  icon?: string | null;
  as?: "p" | "div" | "span";
  children?: ReactNode;
  role?: "status" | "alert";
  id?: string;
  className?: string;
  "data-so"?: string;
  [data: `data-${string}`]: string | number | undefined;
}

export const StatusText = ({ tone = "warn", icon, as: Tag = "p", children, className, ...rest }: StatusTextProps) => {
  const glyph = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <Tag {...rest} className={cx("so-status-text", className)} data-tone={tone}>
      {glyph && <Icon name={glyph} />}
      <span>{children}</span>
    </Tag>
  );
};

export default StatusText;

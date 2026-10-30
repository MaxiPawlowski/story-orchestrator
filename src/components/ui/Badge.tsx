import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";

export type Tone = "neutral" | "info" | "ok" | "warn" | "error";

export const TONE_ICON: Record<Tone, string | null> = { neutral: null, info: "fa-circle-info", ok: "fa-check", warn: "fa-triangle-exclamation", error: "fa-circle-xmark" };

export interface BadgeProps {
  tone?: Tone;
  icon?: string | null;
  children: ReactNode;
  className?: string;
  title?: string;
  "aria-label"?: string;
  "data-so"?: string;
}

export const Badge = ({ tone = "neutral", icon, children, className, ...rest }: BadgeProps) => {
  const glyph = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span {...rest} className={cx("so-badge", className)} data-tone={tone}>
      {glyph && <Icon name={glyph} />}
      {children}
    </span>
  );
};

export interface ChipProps {
  tone?: Tone;
  icon?: string | null;
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
  "data-so"?: string;
}

export const Chip = ({ tone = "neutral", icon, children, selected, onClick, onRemove, removeLabel, className, "data-so": dataSo }: ChipProps) => {
  const glyph = icon === undefined ? TONE_ICON[tone] : icon;
  const body = <>{glyph && <Icon name={glyph} />}{children}</>;
  return (
    <span className={cx("so-chip", className)} data-tone={tone} data-so={dataSo} data-selected={selected || undefined}>
      {onClick ? <button type="button" className="so-chip-main" aria-pressed={selected} onClick={onClick}>{body}</button> : <span className="so-chip-main">{body}</span>}
      {onRemove && <button type="button" className="so-chip-remove" aria-label={removeLabel ?? "Remove"} title={removeLabel ?? "Remove"} onClick={onRemove}><Icon name="fa-xmark" /></button>}
    </span>
  );
};

export default Badge;

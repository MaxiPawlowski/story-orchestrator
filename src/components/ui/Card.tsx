import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";
import type { Tone } from "./Badge";

export interface CardProps {
  id?: string;
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: Tone;
  selected?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  "aria-label"?: string;
  "data-so"?: string;
}

export const Card = ({ id, title, actions, children, tone, selected, interactive, onClick, className, "aria-label": ariaLabel, "data-so": dataSo }: CardProps) => {
  const head = (title || actions) && (
    <span className="so-card-head">
      {title && <span className="so-card-title">{title}</span>}
      {actions}
    </span>
  );
  const shared = { id, "data-so": dataSo, "data-tone": tone, "data-selected": selected || undefined, "aria-label": ariaLabel };
  if (interactive && onClick) {
    return (
      <button type="button" {...shared} data-interactive="true" aria-pressed={selected} className={cx("so-card", className)} onClick={onClick}>
        <span className="so-card-main">{head}{children}</span>
        <Icon name="fa-chevron-right" />
      </button>
    );
  }
  return <section {...shared} className={cx("so-card", className)}>{head}{children}</section>;
};

export default Card;

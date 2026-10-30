import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";

export interface EmptyStateProps {
  icon?: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}

export const EmptyState = ({ icon, title, children, action, className, id }: EmptyStateProps) => (
  <div id={id} data-so="empty-state" className={cx("so-empty", className)}>
    {icon && <Icon name={icon} />}
    <p className="so-empty-title">{title}</p>
    {children && <div className="so-empty-body">{children}</div>}
    {action}
  </div>
);

export default EmptyState;

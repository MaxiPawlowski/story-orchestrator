import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ToolbarProps {
  label?: string;
  start?: ReactNode;
  end?: ReactNode;
  children?: ReactNode;
  sticky?: boolean;
  className?: string;
  id?: string;
}

export const Toolbar = ({ label, start, end, children, sticky = false, className, id }: ToolbarProps) => (
  <div id={id} role="group" aria-label={label} data-sticky={sticky || undefined} className={cx("so-toolbar", className)}>
    {(start || children) && <div className="so-toolbar-start">{start}{children}</div>}
    {end && <div className="so-toolbar-end">{end}</div>}
  </div>
);

export default Toolbar;

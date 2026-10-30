import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";
import { Badge, type Tone } from "./Badge";

export interface NavItem {
  id: string;
  label: ReactNode;
  icon?: string;
  count?: number;
  badge?: { text: ReactNode; tone?: Tone };
  disabled?: boolean;
  elementId?: string;
}

export interface NavGroup {
  label?: ReactNode;
  items: NavItem[];
}

export interface NavListProps {
  label: string;
  groups: NavGroup[];
  value: string;
  onSelect: (id: string) => void;
  mobile?: "bar" | "stack";
  className?: string;
  id?: string;
}

export const NavList = ({ label, groups, value, onSelect, mobile = "bar", className, id }: NavListProps) => (
  <nav id={id} aria-label={label} data-mobile={mobile} className={cx("so-nav", className)}>
    {groups.map((group, index) => (
      <div key={index} className="so-nav-section">
        {group.label && <div className="so-nav-group">{group.label}</div>}
        <ul>
          {group.items.map((item) => (
            <li key={item.id}>
              <button type="button" id={item.elementId} className="so-nav-item" aria-current={item.id === value ? "page" : undefined} disabled={item.disabled}
                onClick={() => onSelect(item.id)}>
                <span className="so-nav-label">{item.icon && <Icon name={item.icon} />}{item.label}</span>
                {item.count !== undefined && <span className="so-nav-count">{item.count}</span>}
                {item.badge && <Badge tone={item.badge.tone ?? "neutral"}>{item.badge.text}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </nav>
);

export default NavList;

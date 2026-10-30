import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Button";

export interface SectionProps {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  level?: 2 | 3 | 4;
  className?: string;
  "data-so"?: string;
}

export const Section = ({ id, title, description, actions, children, collapsible = false, defaultOpen = false, level = 3, className, "data-so": dataSo }: SectionProps) => {
  if (collapsible) {
    return (
      <details id={id} data-so={dataSo} className={cx("so-section", className)} data-collapsible="true" open={defaultOpen || undefined}>
        <summary className="so-section-summary">
          <Icon name="fa-chevron-right" />
          <span className="so-section-title">{title}</span>
          {actions && <span className="so-section-actions">{actions}</span>}
        </summary>
        {description && <p className="so-section-desc">{description}</p>}
        <div className="so-section-body">{children}</div>
      </details>
    );
  }
  const Heading = `h${level}` as const;
  return (
    <section id={id} data-so={dataSo} className={cx("so-section", className)}>
      {(title || actions) && (
        <header className="so-section-head">
          {title && <Heading className="so-section-title">{title}</Heading>}
          {actions && <span className="so-section-actions">{actions}</span>}
        </header>
      )}
      {description && <p className="so-section-desc">{description}</p>}
      <div className="so-section-body">{children}</div>
    </section>
  );
};

export default Section;

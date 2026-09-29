import React, { useId, useState } from "react";

type Props = {
  title: string;
  i18nKey?: string;
  className?: string;
  href?: string;
  reference?: string;
};

const HelpTooltip: React.FC<Props> = ({ title, i18nKey, className, href, reference }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className={`st-help ${className ?? ""}`} onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); event.stopPropagation(); }
  }}>
    <button type="button" className="st-help-icon fa-solid fa-circle-question" aria-label={`Help: ${title}`} aria-expanded={open}
      aria-controls={id} title={title} data-i18n={i18nKey ? `[title]${i18nKey}` : undefined}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(!open); }} />
    {open && <span id={id} role="note" className="st-help-content" onClick={(event) => event.stopPropagation()}>
      <span>{title}</span>
      {href && <a href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{reference ?? "Read more"}</a>}
    </span>}
  </span>;
};

export default HelpTooltip;

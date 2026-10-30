import React, { useRef } from "react";
import { IconButton } from "@components/ui/IconButton";
import { navLinks, pageKey, sectionLabel, type StudioNavGroup, type StudioPage } from "../studioNav";
import "../mobile.css";

interface StudioNavProps {
  groups: StudioNavGroup[];
  page: StudioPage;
  onSelect: (page: StudioPage) => void;
  onBack?: () => void;
}

const STEP: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 };

export const StudioSidebar = ({ groups, page, onSelect }: Omit<StudioNavProps, "onBack">) => {
  const links = navLinks(groups);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const current = pageKey(page);
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = STEP[event.key] ?? (event.key === "Home" ? -Infinity : event.key === "End" ? Infinity : null);
    if (step === null) return;
    event.preventDefault();
    const focused = links.findIndex((link) => refs.current[link.key] === event.target);
    const at = focused >= 0 ? focused : links.findIndex((link) => link.key === current);
    const next = step === -Infinity ? 0 : step === Infinity ? links.length - 1 : (at + step + links.length) % links.length;
    onSelect(links[next].page);
    refs.current[links[next].key]?.focus();
  };
  return (
    <nav className="so-nav so-studio-nav" aria-label="Studio pages">
      <div role="tablist" aria-orientation="vertical" aria-label="Studio sections" onKeyDown={onKeyDown}>
        {groups.map((group) => (
          <div key={group.label} className="so-nav-section" role="presentation">
            {group.links.length > 1 && <div className="so-nav-group" role="presentation">{group.label}</div>}
            {group.links.map((link) => {
              const selected = link.key === current;
              return (
                <button key={link.key} ref={(node) => { refs.current[link.key] = node; }} id={link.elementId} type="button" role="tab"
                  aria-selected={selected} aria-controls="so-studio-tabpanel" tabIndex={selected ? 0 : -1}
                  data-member={link.page.member} className={`so-nav-item${link.page.member ? " so-studio-nav-member" : ""}`} onClick={() => onSelect(link.page)}>
                  <span className="so-nav-label">{link.label}</span>
                  {link.badge ? <span className="so-nav-count" aria-hidden="true" title={`${link.badge} issues`}>{link.badge}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
};

export const StudioSectionSelect = ({ groups, page, onSelect, onBack }: StudioNavProps) => {
  const links = navLinks(groups);
  return (
    <div className="so-studio-section">
      {onBack && <IconButton id="so-studio-back" icon="fa-arrow-left" label="Back" onClick={onBack} />}
      <label className="so-studio-section-label">
        <span className="sr-only">Section</span>
        <select id="so-studio-section" className="text_pole so-field" aria-label="Studio section" value={pageKey(page)}
          onChange={(event) => { const link = links.find((entry) => entry.key === event.target.value); if (link) onSelect(link.page); }}>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.links.map((link) => <option key={link.key} value={link.key}>{sectionLabel(groups, link.page)}{link.badge ? ` (${link.badge})` : ""}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  );
};

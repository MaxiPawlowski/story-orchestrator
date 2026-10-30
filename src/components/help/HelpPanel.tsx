import { useState, type ReactNode } from "react";
import { featuresByArea, guideUrl, matchesQuery, NEED_LABELS, type Feature, type FeatureAudience, type FeatureWhere } from "@features/registry";
import { GUIDE_COPY, HELP_COPY, HELP_SOURCE_LABELS } from "@features/helpCopy";
import type { HelpRowState } from "@runtime/helpFeatureState";
import { Button } from "@components/ui/Button";
import { IconButton } from "@components/ui/IconButton";
import { SearchField } from "@components/ui/SearchField";
import { EmptyState } from "@components/ui/EmptyState";
import { Section } from "@components/ui/Section";
import "./help.css";

export interface HelpGuideTopic {
  id: string;
  title: string;
  text: string;
  doc: string;
}

export interface HelpFinding {
  check: string;
  text: string;
}

export interface HelpPanelProps {
  features: readonly Feature[];
  stateOf: (feature: Feature) => HelpRowState | null;
  whereOf?: (feature: Feature) => FeatureWhere | null;
  findingsOf?: (feature: Feature) => readonly HelpFinding[];
  onOpenSetup?: () => void;
  homePage: string;
  guideTopics?: readonly HelpGuideTopic[];
  onShowMe?: (where: FeatureWhere) => void;
  onOpenDoc?: (doc?: string) => void;
  onClose?: () => void;
  onTour?: () => void;
  ask?: ReactNode;
  legend?: ReactNode;
  hosted?: boolean;
}

export const canShow = (where: FeatureWhere): boolean => where.selector.startsWith("#") && (where.surface === "settings" || where.surface === "drawer");

const AUDIENCES: readonly FeatureAudience[] = ["player", "setup", "author"];

export const featuresByAudience = (features: readonly Feature[]): Array<{ audience: FeatureAudience; label: string; features: Feature[] }> => {
  const ordered = featuresByArea(features).flatMap((group) => group.features);
  return AUDIENCES.map((audience) => ({ audience, label: HELP_COPY.audiences[audience], features: ordered.filter((feature) => feature.audience === audience) }))
    .filter((group) => group.features.length);
};

const topicMatches = (topic: HelpGuideTopic, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${topic.title} ${topic.text}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
};

const ReadMore = ({ doc, homePage, onOpenDoc }: { doc: string; homePage: string; onOpenDoc?: (doc?: string) => void }) => {
  if (onOpenDoc) return <Button size="sm" variant="ghost" data-so="help-read-more" data-doc={doc} onClick={() => onOpenDoc(doc)}>{HELP_COPY.readMore}</Button>;
  const link = guideUrl(doc, homePage);
  return link ? <a data-so="help-read-more" className="so-help-link" href={link} target="_blank" rel="noreferrer">{HELP_COPY.readMore}</a> : null;
};

interface FeatureRowProps {
  feature: Feature;
  state: HelpRowState | null;
  where: FeatureWhere | null;
  findings: readonly HelpFinding[];
  homePage: string;
  searching: boolean;
  onShowMe?: (where: FeatureWhere) => void;
  onOpenDoc?: (doc?: string) => void;
  onOpenSetup?: () => void;
}

const StateChips = ({ state }: { state: HelpRowState }) => <>
  {state.parts.map((part, index) => <span key={part.label ?? index} data-so="help-state" data-on={part.on} data-source={part.source ?? "none"} className="so-help-state">
    {part.label && <span className="so-help-muted">{part.label}:</span>}
    <span className={part.on ? "so-success-text" : "so-help-muted"}>{part.word}</span>
    {part.source && <span data-so="help-source" className="so-source-chip">{HELP_SOURCE_LABELS[part.source]}</span>}
  </span>)}
</>;

const FeatureRow = ({ feature, state, where, findings, homePage, searching, onShowMe, onOpenDoc, onOpenSetup }: FeatureRowProps) => {
  const setup = state?.parts.flatMap((part) => (part.setup ? [part.label ? `${part.label}: ${part.setup}` : part.setup] : [])) ?? [];
  const showMe = onShowMe && where && canShow(where) ? where : null;
  return (
    <li data-so="help-feature" data-feature={feature.id} data-audience={feature.audience} className="so-help-feature">
      <div className="so-help-row-head">
        <span className="so-help-name">{feature.name}</span>
        {state && <StateChips state={state} />}
        {feature.status === "experimental" && <span data-so="help-experimental" className="so-help-muted">{HELP_COPY.experimental}</span>}
      </div>
      {setup.map((line) => <div key={line} data-so="help-setup" className="so-help-small so-warning-text">{line}</div>)}
      <div className="so-help-small">{feature.oneLine}</div>
      {searching && <div data-so="help-what" className="so-help-small so-help-muted">{feature.what}</div>}
      <div data-so="help-where" className="so-help-small so-help-muted">{HELP_COPY.where}: {(where ?? feature.where).label}</div>
      {feature.needs?.length ? <div data-so="help-needs" className="so-help-small so-help-muted">{HELP_COPY.needs}: {feature.needs.map((need) => NEED_LABELS[need]).join(", ")}</div> : null}
      {findings.length > 0 && <ul data-so="help-findings" className="so-help-list so-help-small">
        {findings.map((finding) => <li key={finding.check} data-so="help-finding" data-check={finding.check} className="so-help-row-head">
          <span>{finding.text}</span>
          {onOpenSetup && <Button size="sm" data-so="help-finding-show-me" onClick={onOpenSetup}>{HELP_COPY.openSetup}</Button>}
        </li>)}
      </ul>}
      <div className="so-help-row-head">
        {showMe && (
          <Button size="sm" data-so="help-show-me" data-target={showMe.workspace?.control ?? showMe.selector.replace(/^#/, "")} onClick={() => onShowMe?.(showMe)}>{HELP_COPY.showMe}</Button>
        )}
        <ReadMore doc={feature.doc} homePage={homePage} onOpenDoc={onOpenDoc} />
      </div>
    </li>
  );
};

export function HelpPanel({ features, stateOf, whereOf, findingsOf, onOpenSetup, homePage, guideTopics = [], onShowMe, onOpenDoc, onClose, onTour, ask, legend, hosted = false }: HelpPanelProps) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const shown = features.filter((feature) => matchesQuery(feature, query));
  const topics = guideTopics.filter((topic) => topicMatches(topic, query));
  return (
    <section id="so-help" data-so="help-panel" aria-label={HELP_COPY.heading} className="so-help-panel so-help-flat">
      {!hosted && <div className="so-help-row-head so-help-header">
        <span className="so-help-title">{HELP_COPY.heading}</span>
        {onClose && <IconButton size="sm" icon="fa-xmark" data-so="help-close" label={HELP_COPY.close} onClick={onClose} />}
      </div>}
      <p className="so-help-small so-help-muted">{HELP_COPY.intro}</p>
      {ask}
      {(onOpenDoc || onTour) && <div className="so-help-row-head">
        {onTour && <Button size="sm" data-so="help-tour" onClick={onTour}>{HELP_COPY.tour}</Button>}
        {onOpenDoc && <Button size="sm" data-so="help-open-guide" onClick={() => onOpenDoc()}>{GUIDE_COPY.open}</Button>}
      </div>}
      <SearchField data-so="help-search" value={query} onChange={setQuery} label={HELP_COPY.search} placeholder={HELP_COPY.searchPlaceholder} />
      {shown.length === 0 && topics.length === 0 && <div data-so="help-empty"><EmptyState icon="fa-magnifying-glass" title={HELP_COPY.noMatch} /></div>}
      {featuresByAudience(shown).map((group) => (
        <div key={group.audience} data-so="help-group" data-audience={group.audience} className="so-help-group">
          <h3 className="so-help-group-title">{group.label}</h3>
          <ul className="so-help-list">
            {group.features.map((feature) => <FeatureRow key={feature.id} feature={feature} state={stateOf(feature)} where={whereOf ? whereOf(feature) : feature.where}
              findings={findingsOf?.(feature) ?? []} homePage={homePage} searching={searching} onShowMe={onShowMe} onOpenDoc={onOpenDoc} onOpenSetup={onOpenSetup} />)}
          </ul>
        </div>
      ))}
      {legend && !searching && (
        <Section data-so="help-legend" title={HELP_COPY.legendHeading} description={HELP_COPY.legendIntro} className="so-help-group">{legend}</Section>
      )}
      {topics.length > 0 && (
        <div data-so="help-guide-topics" className="so-help-group">
          <h3 className="so-help-group-title">{HELP_COPY.guideHeading}</h3>
          <p className="so-help-small so-help-muted">{HELP_COPY.guideIntro}</p>
          <ul className="so-help-list">
            {topics.map((topic) => (
              <li key={topic.id} data-so="help-guide-topic" data-topic={topic.id} className="so-help-feature">
                <span className="so-help-name">{topic.title}</span>
                <span className="so-help-small">{topic.text}</span>
                <span className="so-help-row-head"><ReadMore doc={topic.doc} homePage={homePage} onOpenDoc={onOpenDoc} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default HelpPanel;

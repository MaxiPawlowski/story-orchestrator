import { useId, useState } from "react";
import { featuresByArea, guideUrl, matchesQuery, NEED_LABELS, type Feature, type FeatureWhere } from "@features/registry";
import { GUIDE_COPY, HELP_COPY } from "@features/helpCopy";

export interface HelpGuideTopic {
  id: string;
  title: string;
  text: string;
  doc: string;
}

export interface HelpPanelProps {
  features: readonly Feature[];
  isOn: (feature: Feature) => boolean | null;
  homePage: string;
  guideTopics?: readonly HelpGuideTopic[];
  onShowMe?: (where: FeatureWhere) => void;
  onOpenDoc?: (doc?: string) => void;
  onClose?: () => void;
}

export const canShow = (where: FeatureWhere): boolean => where.selector.startsWith("#") && (where.surface === "settings" || where.surface === "drawer");

const topicMatches = (topic: HelpGuideTopic, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${topic.title} ${topic.text}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
};

const ReadMore = ({ doc, homePage, onOpenDoc }: { doc: string; homePage: string; onOpenDoc?: (doc?: string) => void }) => {
  if (onOpenDoc) return <button type="button" data-so="help-read-more" data-doc={doc} className="menu_button text-xs" onClick={() => onOpenDoc(doc)}>{HELP_COPY.readMore}</button>;
  const link = guideUrl(doc, homePage);
  return link ? <a data-so="help-read-more" className="text-xs underline" href={link} target="_blank" rel="noreferrer">{HELP_COPY.readMore}</a> : null;
};

interface FeatureRowProps {
  feature: Feature;
  on: boolean | null;
  homePage: string;
  onShowMe?: (where: FeatureWhere) => void;
  onOpenDoc?: (doc?: string) => void;
}

const FeatureRow = ({ feature, on, homePage, onShowMe, onOpenDoc }: FeatureRowProps) => {
  return (
    <li data-so="help-feature" data-feature={feature.id} data-audience={feature.audience} className="so-help-feature flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{feature.name}</span>
        {on !== null && <span data-so="help-state" data-on={on} className={`text-xs ${on ? "so-success-text" : "opacity-70"}`}>{on ? HELP_COPY.on : HELP_COPY.off}</span>}
      </div>
      <div className="text-xs">{feature.oneLine}</div>
      <details className="text-xs">
        <summary className="cursor-pointer opacity-80">{HELP_COPY.where}: {feature.where.label}</summary>
        <div className="pt-1">{feature.what}</div>
      </details>
      {feature.needs?.length ? <div data-so="help-needs" className="text-xs opacity-70">{HELP_COPY.needs}: {feature.needs.map((need) => NEED_LABELS[need]).join(", ")}</div> : null}
      <div className="flex flex-wrap items-center gap-2">
        {onShowMe && canShow(feature.where) && (
          <button type="button" data-so="help-show-me" className="menu_button text-xs" onClick={() => onShowMe(feature.where)}>{HELP_COPY.showMe}</button>
        )}
        <ReadMore doc={feature.doc} homePage={homePage} onOpenDoc={onOpenDoc} />
      </div>
    </li>
  );
};

export function HelpPanel({ features, isOn, homePage, guideTopics = [], onShowMe, onOpenDoc, onClose }: HelpPanelProps) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const shown = features.filter((feature) => matchesQuery(feature, query));
  const topics = guideTopics.filter((topic) => topicMatches(topic, query));
  return (
    <section id="so-help" data-so="help-panel" aria-label={HELP_COPY.heading} className="so-help-panel flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{HELP_COPY.heading}</span>
        {onClose && <button type="button" data-so="help-close" className="menu_button fa-solid fa-xmark" aria-label={HELP_COPY.close} title={HELP_COPY.close} onClick={onClose} />}
      </div>
      <div className="text-xs opacity-80">{HELP_COPY.intro}</div>
      {onOpenDoc && <button type="button" id="so-help-open-guide" data-so="help-open-guide" className="menu_button self-start text-xs" onClick={() => onOpenDoc()}>{GUIDE_COPY.open}</button>}
      <label htmlFor={searchId} className="sr-only">{HELP_COPY.search}</label>
      <input id={searchId} data-so="help-search" type="search" className="text_pole" value={query} placeholder={HELP_COPY.searchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
      {shown.length === 0 && topics.length === 0 && <div data-so="help-empty" className="text-xs opacity-70">{HELP_COPY.noMatch}</div>}
      {featuresByArea(shown).map((group) => (
        <div key={group.area} data-so="help-area" data-area={group.area} className="flex flex-col gap-1">
          <div className="font-medium text-xs uppercase opacity-80">{group.label}</div>
          <ul className="so-help-list flex flex-col gap-2">
            {group.features.map((feature) => <FeatureRow key={feature.id} feature={feature} on={isOn(feature)} homePage={homePage} onShowMe={onShowMe} onOpenDoc={onOpenDoc} />)}
          </ul>
        </div>
      ))}
      {topics.length > 0 && (
        <div data-so="help-guide-topics" className="flex flex-col gap-1">
          <div className="font-medium text-xs uppercase opacity-80">{HELP_COPY.guideHeading}</div>
          <div className="text-xs opacity-70">{HELP_COPY.guideIntro}</div>
          <ul className="so-help-list flex flex-col gap-1">
            {topics.map((topic) => (
              <li key={topic.id} data-so="help-guide-topic" data-topic={topic.id} className="text-xs">
                <details>
                  <summary className="cursor-pointer">{topic.title}</summary>
                  <div className="pt-1">{topic.text}</div>
                  <ReadMore doc={topic.doc} homePage={homePage} onOpenDoc={onOpenDoc} />
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default HelpPanel;

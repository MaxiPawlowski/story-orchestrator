import { useState } from "react";
import { TOUR_COPY } from "@features/tourCopy";
import { log } from "@utils/log";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import { POLICY_NOTES } from "./setupPath";
import { TourMock } from "./TourMocks";
import { TourText } from "./TourText";
import type { TourStep as Step } from "./tourTypes";

export interface TourStepProps {
  step: Step;
  index: number;
  total: number;
  done: boolean;
  nextTitle?: string;
  onTried: (done: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  onReadMore: (doc: string) => void;
  onShow: (intent: WorkspaceIntent) => void;
}

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

export const guideCommand = (doc: string): string => `/story guide ${doc.split("#")[0].replace(/\.md$/, "")}`;

const Block = ({ kind, title, lines }: { kind: "do" | "see" | "off"; title: string; lines: readonly string[] }) => (
  <section className={`so-tour-block so-tour-block-${kind}`} aria-label={title}>
    <h3>{title}</h3>
    <ul>{lines.map((line) => <li key={line}><TourText text={line} /></li>)}</ul>
  </section>
);

const CopyCommand = ({ command }: { command: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      log.warn("The guide command could not be copied", error);
      setCopied(false);
    }
  };
  return <button type="button" className="so-tour-command" data-so="tour-command" aria-label={`${TOUR_COPY.copy}: ${command}`} onClick={() => void copy()}>
    {copied ? TOUR_COPY.copied : command}
  </button>;
};

export const TourStep = ({ step, index, total, done, nextTitle, onTried, onBack, onNext, onReadMore, onShow }: TourStepProps) => (
  <div className="so-tour-step" data-step={step.id}>
    <div className="so-tour-guide">
      <div className="so-tour-kicker">{step.level !== undefined ? `${fill(TOUR_COPY.level, { n: step.level })} · ` : ""}{fill(TOUR_COPY.stepOf, { n: index + 1, total })}</div>
      <h2 id="so-tour-step-title">{step.title}</h2>
      <p className="so-tour-lead"><TourText text={step.lead} /></p>
      {(step.unlocks || step.cost) && <dl className="so-tour-facts">
        {step.unlocks && <><dt>{TOUR_COPY.unlocks}</dt><dd><TourText text={step.unlocks} /></dd></>}
        {step.cost && <><dt>{TOUR_COPY.cost}</dt><dd><TourText text={step.cost} /></dd></>}
      </dl>}
      <Block kind="do" title={TOUR_COPY.doThis} lines={step.do} />
      {step.show && <div className="so-tour-show">
        <button type="button" className="menu_button so-tour-primary" data-so="tour-show"
          onClick={() => step.show && onShow(step.show)}>{step.level !== undefined ? TOUR_COPY.openSetting : TOUR_COPY.showMe}</button>
        {step.where && <span className="so-tour-where">{step.where}</span>}
      </div>}
      {step.features && <ul className="so-tour-features" aria-label={step.title}>{step.features.map((id) => (
        <li key={id} data-feature={id}>
          <div className="so-tour-feature-head"><strong>{FEATURE_CONTROLS[id].name}</strong>
            <button type="button" className="menu_button" data-so="tour-feature-show" aria-label={`${TOUR_COPY.openSetting}: ${FEATURE_CONTROLS[id].name}`}
              onClick={() => onShow({ context: "orchestrator", page: "defaults", feature: id, control: `so-feature-${id}-enabled` })}>{TOUR_COPY.openSetting}</button></div>
          <span>{FEATURE_CONTROLS[id].description}</span>
          <span><b>{TOUR_COPY.featureCost}:</b> <TourText text={POLICY_NOTES[id].cost} /></span>
          <span><b>{TOUR_COPY.turnOff}:</b> <TourText text={POLICY_NOTES[id].off} /></span>
        </li>
      ))}</ul>}
      <Block kind="see" title={TOUR_COPY.youShouldSee} lines={step.see} />
      <Block kind="off" title={TOUR_COPY.ifOff} lines={step.off} />
      {step.doc && <div className="so-tour-more">
        <span className="so-tour-more-label">{TOUR_COPY.readMore}</span>
        <button type="button" className="so-tour-link" data-so="tour-read-more" data-doc={step.doc} onClick={() => step.doc && onReadMore(step.doc)}>{step.docTitle ?? step.title}</button>
        <span className="so-tour-hint">{TOUR_COPY.inChat}</span>
        <CopyCommand command={guideCommand(step.doc)} />
      </div>}
      <div className="so-tour-foot">
        <label className="so-tour-tried"><input type="checkbox" data-so="tour-tried" checked={done} onChange={(event) => onTried(event.target.checked)} /> {TOUR_COPY.tried}</label>
        <span className="so-tour-actions">
          <button type="button" className="menu_button" data-so="tour-back" disabled={index === 0} onClick={onBack}>{TOUR_COPY.back}</button>
          <button type="button" className="menu_button so-tour-primary" data-so="tour-next" disabled={index >= total - 1} onClick={onNext}
            title={nextTitle ? fill(TOUR_COPY.nextUp, { title: nextTitle }) : TOUR_COPY.last}>{TOUR_COPY.next}</button>
        </span>
      </div>
      <p className="so-tour-hint so-tour-next-up">{nextTitle ? fill(TOUR_COPY.nextUp, { title: nextTitle }) : TOUR_COPY.last}</p>
    </div>
    <TourMock key={step.id} mock={step.mock} setting={step.setting} features={step.features} />
  </div>
);

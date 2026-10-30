import { useState } from "react";
import type { OneClickFix, RepairStep, SetupFindings, ShowMe } from "@runtime/repair";
import { ActionStatus, useActionStatus } from "@components/ActionStatus";
import { Button } from "@components/ui/Button";
import { StatusIcon, type StatusTone } from "@components/ui/StatusDot";

export interface SetupHandlers {
  onShowMe?(target: ShowMe): void;
  onFix?(action: OneClickFix): Promise<string | null> | void;
  onDismiss?(check: string, dismissed: boolean): void;
}

export const SETUP_COPY = {
  heading: "Needs attention",
  count: (count: number) => (count === 1 ? "1 thing needs attention" : `${count} things need attention`),
  blocks: "Stops the story",
  degrades: "Weakens the story",
  info: "Good to know",
  showMe: "Show me",
  dismiss: "Hide",
  hidden: "Hidden.",
  undo: "Undo",
  restore: "Show again",
  dismissed: (count: number) => `${count} hidden`,
  beforeYouStart: "Before you start",
} as const;

const TONE: Record<RepairStep["severity"], StatusTone> = { blocks: "error", degrades: "warn", info: "info" };
const SEVERITY_LABEL: Record<RepairStep["severity"], string> = { blocks: SETUP_COPY.blocks, degrades: SETUP_COPY.degrades, info: SETUP_COPY.info };

const SetupRow = ({ step, authorView, handlers, onHide }: { step: RepairStep; authorView: boolean; handlers: SetupHandlers; onHide?: (step: RepairStep) => void }) => {
  const status = useActionStatus();
  return (
    <div data-so="setup-row" data-check={step.check} data-severity={step.severity} className="so-attention-row">
      <StatusIcon tone={TONE[step.severity]} />
      <div className="so-attention-body">
        <span className="sr-only">{SEVERITY_LABEL[step.severity]}</span>
        <p className={`so-attention-text ${step.severity === "blocks" ? "so-warning-text" : ""}`}>{step.consequence}</p>
        {authorView && step.detail !== step.consequence && <p data-so="setup-detail" className="so-attention-detail">{step.detail}</p>}
        <div className="so-actions">
          {step.target && handlers.onShowMe && (
            <Button size="sm" data-so="setup-show-me" onClick={() => handlers.onShowMe?.(step.target as ShowMe)}>{SETUP_COPY.showMe}</Button>
          )}
          {step.action && handlers.onFix && (
            <Button size="sm" data-so="setup-fix" work={() => status.run(() => handlers.onFix?.(step.action as OneClickFix))}>{step.action.label}</Button>
          )}
          {step.dismissable && handlers.onDismiss && (
            <Button size="sm" variant="ghost" data-so="setup-dismiss" onClick={() => { handlers.onDismiss?.(step.check, true); onHide?.(step); }}>{SETUP_COPY.dismiss}</Button>
          )}
        </div>
        <ActionStatus text={status.text} />
      </div>
    </div>
  );
};

export const setupShown = (findings: SetupFindings): boolean =>
  findings.blocks.length + findings.degrades.length + findings.info.length + findings.dismissed.length > 0;

export const attentionTone = (findings: SetupFindings): StatusTone =>
  (findings.blocks.length ? "error" : findings.degrades.length ? "warn" : "info");

export interface SetupSectionProps extends SetupHandlers {
  findings: SetupFindings;
  authorView: boolean;
  beforeStart?: boolean;
  open?: boolean;
}

export default function SetupSection({ findings, authorView, beforeStart = false, open: forced = false, ...handlers }: SetupSectionProps) {
  const live = findings.blocks.length + findings.degrades.length + findings.info.length;
  const [open, setOpen] = useState(forced || findings.blocks.length > 0);
  const [hidden, setHidden] = useState<RepairStep | null>(null);
  if (!setupShown(findings) && !hidden) return null;
  const first = beforeStart && !authorView ? findings.blocks : [];
  const rows = [...findings.blocks.filter((step) => !first.includes(step)), ...findings.degrades, ...findings.info];
  const tone = attentionTone(findings);
  const shown = open || forced;
  return (
    <section id="so-setup" aria-label={SETUP_COPY.heading} className="so-attention" data-tone={live ? tone : "ok"} tabIndex={-1}>
      <button id="so-setup-toggle" type="button" className="so-attention-toggle" aria-expanded={shown} aria-controls="so-setup-rows" onClick={() => setOpen(!shown)}>
        <StatusIcon tone={live ? tone : "ok"} />
        <span className="so-attention-label">{live ? SETUP_COPY.count(live) : SETUP_COPY.dismissed(findings.dismissed.length)}</span>
        <i aria-hidden="true" className={`fa-solid ${shown ? "fa-chevron-up" : "fa-chevron-down"}`} />
      </button>
      {hidden && handlers.onDismiss && (
        <p role="status" data-so="setup-hidden" className="so-attention-hidden">
          <span>{SETUP_COPY.hidden}</span>
          <Button size="sm" variant="ghost" data-so="setup-undo" onClick={() => { handlers.onDismiss?.(hidden.check, false); setHidden(null); }}>{SETUP_COPY.undo}</Button>
        </p>
      )}
      <div id="so-setup-rows" className="so-attention-rows" hidden={!shown}>
        <BeforeYouStart steps={first} onShowMe={handlers.onShowMe} onFix={handlers.onFix} />
        {rows.map((step) => <SetupRow key={step.check} step={step} authorView={authorView} handlers={handlers} onHide={setHidden} />)}
        {findings.dismissed.length > 0 && (
          <div data-so="setup-dismissed" className="so-attention-dismissed">
            <p className="so-attention-detail">{SETUP_COPY.dismissed(findings.dismissed.length)}</p>
            {findings.dismissed.map((step) => (
              <div key={step.check} data-so="setup-dismissed-row" data-check={step.check} className="so-actions">
                <span className="min-w-0 flex-1">{step.consequence}</span>
                {handlers.onDismiss && (
                  <Button size="sm" variant="ghost" data-so="setup-restore" onClick={() => handlers.onDismiss?.(step.check, false)}>{SETUP_COPY.restore}</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const BeforeYouStart = ({ steps, onShowMe, onFix }: { steps: RepairStep[] } & Pick<SetupHandlers, "onShowMe" | "onFix">) => (steps.length ? (
  <section id="so-before-you-start" aria-label={SETUP_COPY.beforeYouStart} className="flex flex-col gap-2">
    <h3 className="so-attention-heading">{SETUP_COPY.beforeYouStart}</h3>
    {steps.map((step) => <SetupRow key={step.check} step={step} authorView={false} handlers={{ onShowMe, onFix }} />)}
  </section>
) : null);

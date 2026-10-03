import type { OneClickFix, RepairStep, SetupFindings, ShowMe } from "@runtime/repair";

export interface SetupHandlers {
  onShowMe?(target: ShowMe): void;
  onFix?(action: OneClickFix): void;
  onDismiss?(check: string, dismissed: boolean): void;
}

export const SETUP_COPY = {
  heading: "Setup",
  blocks: "Stops the story",
  degrades: "Weakens the story",
  info: "Good to know",
  showMe: "Show me",
  dismiss: "I know, keep it",
  restore: "Show again",
  dismissed: (count: number) => `${count} dismissed`,
  beforeYouStart: "Before you start",
} as const;

const SEVERITY_LABEL: Record<RepairStep["severity"], string> = { blocks: SETUP_COPY.blocks, degrades: SETUP_COPY.degrades, info: SETUP_COPY.info };

const SetupRow = ({ step, authorView, handlers }: { step: RepairStep; authorView: boolean; handlers: SetupHandlers }) => (
  <div data-so="setup-row" data-check={step.check} data-severity={step.severity} className="flex flex-col gap-1 border-t border-solid border-white/10 pt-1">
    <div className="text-xs opacity-70">{SEVERITY_LABEL[step.severity]}</div>
    <div className={`text-sm ${step.severity === "blocks" ? "so-warning-text" : ""}`}>{step.consequence}</div>
    {authorView && step.detail !== step.consequence && <div data-so="setup-detail" className="text-xs opacity-70">{step.detail}</div>}
    <div className="flex flex-wrap items-center gap-2">
      {step.target && handlers.onShowMe && (
        <button type="button" data-so="setup-show-me" className="menu_button" onClick={() => handlers.onShowMe?.(step.target as ShowMe)}>{SETUP_COPY.showMe}</button>
      )}
      {step.action && handlers.onFix && (
        <button type="button" data-so="setup-fix" className="menu_button" onClick={() => handlers.onFix?.(step.action as OneClickFix)}>{step.action.label}</button>
      )}
      {step.dismissable && handlers.onDismiss && (
        <button type="button" data-so="setup-dismiss" className="menu_button opacity-80" onClick={() => handlers.onDismiss?.(step.check, true)}>{SETUP_COPY.dismiss}</button>
      )}
    </div>
  </div>
);

export const setupShown = (findings: SetupFindings): boolean =>
  findings.blocks.length + findings.degrades.length + findings.info.length + findings.dismissed.length > 0;

export default function SetupSection({ findings, authorView, beforeStart = false, ...handlers }: { findings: SetupFindings; authorView: boolean; beforeStart?: boolean } & SetupHandlers) {
  if (!setupShown(findings)) return null;
  const first = beforeStart && !authorView ? findings.blocks : [];
  const rows = [...findings.blocks.filter((step) => !first.includes(step)), ...findings.degrades, ...findings.info];
  return (
    <section id="so-setup" aria-label={SETUP_COPY.heading} className="so-task-card flex flex-col gap-1">
      <div className="font-medium text-sm">{SETUP_COPY.heading}</div>
      <BeforeYouStart steps={first} onShowMe={handlers.onShowMe} onFix={handlers.onFix} />
      {rows.map((step) => <SetupRow key={step.check} step={step} authorView={authorView} handlers={handlers} />)}
      {findings.dismissed.length > 0 && (
        <details data-so="setup-dismissed" className="text-xs opacity-80">
          <summary>{SETUP_COPY.dismissed(findings.dismissed.length)}</summary>
          {findings.dismissed.map((step) => (
            <div key={step.check} data-so="setup-dismissed-row" data-check={step.check} className="flex flex-wrap items-center gap-2 pt-1">
              <span className="min-w-0 flex-1">{step.consequence}</span>
              {handlers.onDismiss && (
                <button type="button" data-so="setup-restore" className="menu_button" onClick={() => handlers.onDismiss?.(step.check, false)}>{SETUP_COPY.restore}</button>
              )}
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

const BeforeYouStart = ({ steps, onShowMe, onFix }: { steps: RepairStep[] } & Pick<SetupHandlers, "onShowMe" | "onFix">) => (steps.length ? (
  <section id="so-before-you-start" aria-label={SETUP_COPY.beforeYouStart} className="flex flex-col gap-1">
    <div className="font-medium text-sm">{SETUP_COPY.beforeYouStart}</div>
    {steps.map((step) => <SetupRow key={step.check} step={step} authorView={false} handlers={{ onShowMe, onFix }} />)}
  </section>
) : null);

import { gettingStartedShown, type GettingStartedStep, type RepairStep } from "@runtime/repair";
import { HELP_COPY } from "@features/helpCopy";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";
import "../help/help.css";

export interface GettingStartedProps {
  steps: readonly GettingStartedStep[];
  dismissed: boolean;
  onReveal: (targetId: string) => void;
  onHide: () => void;
  installChecks?: readonly RepairStep[];
}

export function GettingStarted({ steps, dismissed, onReveal, onHide, installChecks = [] }: GettingStartedProps) {
  if (!gettingStartedShown(steps, dismissed) && !installChecks.length) return null;
  const requiredDone = steps.every((step) => step.optional || step.done);
  return (
    <div id="so-getting-started" data-so="getting-started" className="flex flex-col gap-1 border-t border-solid border-[var(--so-line)] pt-1">
      <div className="text-xs font-medium">{HELP_COPY.gettingStartedHeading}</div>
      <ol className="so-help-list flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id} data-so="getting-started-step" data-step={step.id} data-done={step.done} className="flex items-start gap-2 text-xs">
            <i className={`${step.done ? "fa-solid fa-circle-check text-[var(--so-ok)]" : "fa-regular fa-circle"} mt-1`} aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span data-so="getting-started-title"><span className="font-medium">{step.title}</span>{step.optional && <span className="opacity-70"> ({HELP_COPY.optional})</span>}</span>
              {!step.done && <div className="opacity-70">{step.consequence}</div>}
            </div>
            {step.done
              ? <StatusText as="span" tone="ok" className="shrink-0">{HELP_COPY.done}</StatusText>
              : <Button type="button" data-so="getting-started-reveal" size="sm" className="shrink-0" onClick={() => onReveal(step.targetId)}>{HELP_COPY.showMe}</Button>}
          </li>
        ))}
      </ol>
      {installChecks.map((check) => (
        <div key={check.check} data-so="getting-started-check" data-check={check.check} className="flex flex-wrap items-center gap-2 text-xs">
          <i className="fa-solid fa-triangle-exclamation text-[var(--so-warn)]" aria-hidden="true" />
          <span className="min-w-0 flex-1">{check.consequence}</span>
          {check.targetId && (
            <Button type="button" data-so="getting-started-check-reveal" size="sm" onClick={() => onReveal(check.targetId as string)}>{HELP_COPY.showMe}</Button>
          )}
        </div>
      ))}
      {requiredDone && <Button type="button" id="so-getting-started-hide" className="self-start" size="sm" onClick={onHide}>{HELP_COPY.gettingStartedHide}</Button>}
    </div>
  );
}

export default GettingStarted;

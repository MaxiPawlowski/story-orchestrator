import { gettingStartedShown, type GettingStartedStep } from "@runtime/repair";
import { HELP_COPY } from "@features/helpCopy";

export interface GettingStartedProps {
  steps: readonly GettingStartedStep[];
  dismissed: boolean;
  onReveal: (targetId: string) => void;
  onHide: () => void;
}

export function GettingStarted({ steps, dismissed, onReveal, onHide }: GettingStartedProps) {
  if (!gettingStartedShown(steps, dismissed)) return null;
  const requiredDone = steps.every((step) => step.optional || step.done);
  return (
    <div id="so-getting-started" data-so="getting-started" className="flex flex-col gap-1 border-t border-solid border-white/10 pt-1">
      <div className="text-xs font-medium">{HELP_COPY.gettingStartedHeading}</div>
      <ol className="so-help-list flex flex-col gap-1">
        {steps.map((step) => (
          <li key={step.id} data-so="getting-started-step" data-step={step.id} data-done={step.done} className="flex flex-col gap-0.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <i className={step.done ? "fa-solid fa-circle-check so-success-text" : "fa-regular fa-circle"} aria-hidden="true" />
              <span className="font-medium">{step.title}</span>
              {step.optional && <span className="opacity-70">({HELP_COPY.optional})</span>}
              {step.done
                ? <span className="so-success-text">{HELP_COPY.done}</span>
                : <button type="button" data-so="getting-started-reveal" className="menu_button text-xs" onClick={() => onReveal(step.targetId)}>{HELP_COPY.showMe}</button>}
            </div>
            {!step.done && <div className="opacity-70">{step.consequence}</div>}
          </li>
        ))}
      </ol>
      {requiredDone && <button type="button" id="so-getting-started-hide" className="menu_button self-start text-xs" onClick={onHide}>{HELP_COPY.gettingStartedHide}</button>}
    </div>
  );
}

export default GettingStarted;

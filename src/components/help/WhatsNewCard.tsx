import { guideUrl, type Feature, type FeatureWhere } from "@features/registry";
import { HELP_COPY } from "@features/helpCopy";
import { canShow } from "./HelpPanel";

export interface WhatsNewCardProps {
  features: readonly Feature[];
  homePage: string;
  onShowMe?: (where: FeatureWhere) => void;
  onDismiss: () => void;
}

export function WhatsNewCard({ features, homePage, onShowMe, onDismiss }: WhatsNewCardProps) {
  if (!features.length) return null;
  return (
    <section id="so-whats-new" data-so="whats-new" aria-label={HELP_COPY.whatsNewHeading} className="so-task-card flex flex-col gap-1 text-sm">
      <div className="font-medium">{HELP_COPY.whatsNewHeading}</div>
      <div className="text-xs opacity-80">{HELP_COPY.whatsNewIntro}</div>
      <ul className="so-help-list flex flex-col gap-1">
        {features.map((feature) => {
          const link = guideUrl(feature.doc, homePage);
          return (
            <li key={feature.id} data-so="whats-new-feature" data-feature={feature.id} data-audience={feature.audience} className="flex flex-wrap items-center gap-2 text-xs">
              <span><b>{feature.name}</b>: {feature.oneLine}</span>
              {onShowMe && canShow(feature.where) && (
                <button type="button" className="menu_button text-xs" onClick={() => onShowMe(feature.where)}>{HELP_COPY.showMe}</button>
              )}
              {link && <a className="underline" href={link} target="_blank" rel="noreferrer">{HELP_COPY.readMore}</a>}
            </li>
          );
        })}
      </ul>
      <button type="button" id="so-whats-new-dismiss" className="menu_button self-start" onClick={onDismiss}>{HELP_COPY.whatsNewDismiss}</button>
    </section>
  );
}

export default WhatsNewCard;

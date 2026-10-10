import { useEffect, useRef, useState } from "react";
import { briefingParagraphs, type BriefingView } from "@engine/index";
import { BRIEFING_COPY, ONBOARDING_LINES } from "@features/helpCopy";
import { BRIEFING_DRAFT_COPY } from "@features/briefingDraftCopy";
import { PLAYER_SETUP_COPY } from "@features/playerSetupCopy";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import type { PlayerSetupView } from "@runtime/playerSetup";
import type { ChooseIdentity } from "./PlayerSetupPane";

const PlayerSetupPane = lazyRetry(() => import("./PlayerSetupPane"));

export interface IdentitySlot {
  view: PlayerSetupView;
  rechoose: boolean;
  onChoose: ChooseIdentity;
}

export interface BriefingModalProps {
  briefing: BriefingView | null;
  chapter?: BriefingView | null;
  blocks?: readonly string[];
  onboarding?: boolean;
  optOut?: boolean;
  identity?: IdentitySlot | null;
  onClose: (result: { dontShow: boolean }) => void;
}

const backgroundUrl = (name: string) => `backgrounds/${encodeURIComponent(name)}`;

const Paragraphs = ({ text }: { text: string }) => (
  <>{briefingParagraphs(text).map((paragraph, index) => <p key={index} className="so-briefing-paragraph">{paragraph}</p>)}</>
);

const BriefingBody = ({ view, level }: { view: BriefingView; level: "story" | "chapter" }) => (
  <section data-so={level === "story" ? "briefing-story" : "briefing-chapter"} className="flex flex-col gap-3">
    {level === "chapter" && <h3 className="so-briefing-chapter-title">{view.title}</h3>}
    {view.image && <img data-so="briefing-image" className="so-briefing-image" src={backgroundUrl(view.image)} alt="" />}
    {level === "chapter" && view.tone && <div data-so="briefing-tone" className="text-sm opacity-80">{view.tone}</div>}
    {view.sections.map((section, index) => (
      <div key={index} data-so="briefing-section" className="flex flex-col gap-1">
        <h3 className="so-briefing-heading">{section.heading}</h3>
        <Paragraphs text={section.text} />
      </div>
    ))}
    {view.source === "draft" && <p data-so="briefing-drafted" className="text-sm opacity-70">{BRIEFING_DRAFT_COPY.drafted}</p>}
  </section>
);

export const BriefingModal = ({ briefing, chapter = null, blocks = [], onboarding = false, optOut = false, identity = null, onClose }: BriefingModalProps) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dontShow, setDontShow] = useState(false);
  const closed = useRef(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose({ dontShow });
  };
  useEffect(() => {
    const dialog = dialogRef.current;
    closed.current = false;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      closed.current = true;
      if (dialog?.open) dialog.close();
    };
  }, []);
  const lead = briefing ?? chapter;
  const title = lead?.title ?? (identity && !blocks.length ? PLAYER_SETUP_COPY.heading : BRIEFING_COPY.beforeYouStart);
  const startLabel = lead?.startLabel ?? BRIEFING_COPY.close;
  return (
    <dialog
      id="so-briefing"
      ref={dialogRef}
      aria-labelledby="so-briefing-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
      onClose={close}
    >
      <div className="so-briefing-panel flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 id="so-briefing-title" className="so-briefing-title">{title}</h2>
          {briefing?.tone && <div data-so="briefing-tone" className="text-sm opacity-80">{briefing.tone}</div>}
        </header>
        {blocks.length > 0 && (
          <section data-so="briefing-before-you-start" role="alert" className="so-briefing-blocks flex flex-col gap-1">
            <h3 className="so-briefing-heading">{BRIEFING_COPY.beforeYouStart}</h3>
            <p className="so-briefing-paragraph">{BRIEFING_COPY.beforeYouStartIntro}</p>
            <ul className="flex flex-col gap-1">{blocks.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
        )}
        {identity && <Lazy fallback={null}><PlayerSetupPane view={identity.view} rechoose={identity.rechoose} onChoose={identity.onChoose} /></Lazy>}
        {briefing && <BriefingBody view={briefing} level="story" />}
        {chapter && <BriefingBody view={chapter} level={briefing ? "chapter" : "story"} />}
        {onboarding && (
          <details data-so="briefing-onboarding" className="so-briefing-onboarding">
            <summary>{BRIEFING_COPY.onboarding}</summary>
            <ul className="flex flex-col gap-2 pt-2">
              {ONBOARDING_LINES.map((line) => (
                <li key={line.icon} className="flex items-start gap-2">
                  <i className={`fa-solid ${line.icon} so-briefing-icon`} aria-hidden="true" />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2">
          {optOut ? (
            <label className="flex items-center gap-2 text-sm" title={BRIEFING_COPY.optOutHelp}>
              <input id="so-briefing-optout" type="checkbox" checked={dontShow} onChange={(event) => setDontShow(event.target.checked)} />
              <span>{BRIEFING_COPY.optOut}</span>
            </label>
          ) : <span />}
          <button id="so-briefing-start" type="button" className="menu_button so-briefing-start" autoFocus onClick={close}>{startLabel}</button>
        </footer>
      </div>
    </dialog>
  );
};

export default BriefingModal;

import { useCallback, useRef, useState } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { TENSION_LEVELS, type TensionLevel } from "@engine/schema";
import { branchNoticeText, PLAYER_COPY, rollbackNoticeText, yourMoveAuthorTitle } from "@runtime/narrative";
import { busyText, HUD_COPY, hudChipLabel, hudPendingText, hudSetupText, hudSetupTitle, hudTensionText, playerPendingCount } from "@runtime/pipeline";
import { setupAlert, setupCounts } from "@runtime/repair";
import type { RuntimeSnapshot } from "@runtime/types";
import { SHEET_TEXT } from "@features/sheetCopy";
import { IconButton } from "@components/ui/IconButton";
import type { HudCardActions } from "./HudCard";

const HudCard = lazyRetry(() => import("./HudCard"));
const MediaPending = lazyRetry(() => import("../MediaPending"));

export interface HudSheetControl {
  open: boolean;
  toggle: () => void;
}

export interface HudStripProps {
  snapshot: RuntimeSnapshot;
  onOpenStory: () => void;
  onOpenSettings?: () => void;
  card?: HudCardActions;
  sheet?: HudSheetControl;
}

export const TensionMeter = ({ level }: { level: TensionLevel }) => {
  const filled = TENSION_LEVELS.indexOf(level) + 1;
  return (
    <span className="so-hud-tension" data-so="hud-tension" data-level={level} title={hudTensionText(level)}>
      <span className="so-hud-dots" role="img" aria-label={hudTensionText(level)}>
        {TENSION_LEVELS.map((entry, index) => <span key={entry} className="so-hud-dot" data-on={index < filled} />)}
      </span>
      <span className="so-hud-dim" aria-hidden="true">{level}</span>
    </span>
  );
};

export const HudStrip = ({ snapshot, onOpenStory, onOpenSettings, card, sheet }: HudStripProps) => {
  const [open, setOpen] = useState(false);
  const main = useRef<HTMLButtonElement>(null);
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) main.current?.focus();
  }, []);
  if (!snapshot.ui.hudEnabled) return null;
  const branch = snapshot.chatIdentity?.kind === "branch" ? snapshot.chatIdentity : null;
  if (!snapshot.ready && branch) {
    return (
      <div id="so-hud">
        <button id="so-hud-branch" type="button" className="so-hud-chip" title={branchNoticeText(null)} onClick={onOpenStory}>{HUD_COPY.branchChip}</button>
      </div>
    );
  }
  if (!snapshot.ready) return null;
  const pending = playerPendingCount(snapshot.pendingDeltas);
  const working = busyText(snapshot.busy ?? []);
  const pipeline = snapshot.pipeline;
  const chip = working ?? (pipeline.state === "not-configured" && !snapshot.lastRollback ? null : hudChipLabel(pipeline.state, Boolean(snapshot.lastRollback), pipeline.waitingOn));
  const alert = chip ? null : setupAlert(snapshot);
  const counts = setupCounts(snapshot);
  const sheetAvailable = Boolean(sheet && card?.tabs.length);
  const onChip = () => {
    if (pipeline.needsSetup && onOpenSettings) onOpenSettings();
    else if (card && (pipeline.retryable || pipeline.waitingOn)) setOpen(true);
    else onOpenStory();
  };
  return (
    <>
      {snapshot.busy?.some((job) => job.kind === "image" || job.kind === "sprite") && <Lazy fallback={null}><MediaPending jobs={snapshot.busy} /></Lazy>}
      {card && open && (
        <Lazy fallback={null}>
          <HudCard snapshot={snapshot} {...card} onOpenSettings={card.onOpenSettings ?? onOpenSettings} onMore={onOpenStory} onClose={close} />
        </Lazy>
      )}
      <div id="so-hud">
        <button ref={main} id="so-hud-main" type="button" className="so-hud-main" title={card ? HUD_COPY.open : PLAYER_COPY.openDrawer}
          aria-expanded={card ? open : undefined} aria-controls={card && open ? "so-hud-card" : undefined}
          onClick={() => (card ? setOpen((current) => !current) : onOpenStory())}>
          <i className="fa-solid fa-location-dot so-hud-icon" aria-hidden="true" />
          <span className="so-hud-name">{snapshot.narrative?.headline ?? HUD_COPY.fallbackScene}</span>
          {snapshot.ui.authorView && snapshot.activeCheckpointName && snapshot.activeCheckpointName !== snapshot.narrative?.headline
            ? <span className="so-hud-dim" data-so="hud-author-checkpoint">{snapshot.activeCheckpointName}</span> : null}
          {snapshot.tension.level ? <TensionMeter level={snapshot.tension.level} /> : null}
        </button>
        <div className="so-hud-status">
          {snapshot.turn?.yours ? (
            <span id="so-hud-turn" className="so-hud-chip" role="status"
              title={snapshot.ui.authorView && snapshot.turn.source ? yourMoveAuthorTitle(snapshot.turn.source) : PLAYER_COPY.yourMoveTitle}>{PLAYER_COPY.yourMove}</span>
          ) : null}
          {chip ? (
            <button id="so-hud-pipeline" aria-busy={Boolean(working)} type="button" className="so-hud-chip" data-state={pipeline.state} data-waiting-on={pipeline.waitingOn}
              title={snapshot.lastRollback ? rollbackNoticeText(snapshot.lastRollback) : snapshot.ui.authorView ? pipeline.detail ?? pipeline.text : pipeline.text}
              onClick={onChip}>
              {pipeline.retryable && <i className="fa-solid fa-rotate" aria-hidden="true" />}
              {chip}
            </button>
          ) : alert ? (
            <button id="so-hud-setup" type="button" className="so-hud-chip" title={`${hudSetupTitle(counts)} ${alert.consequence}`} data-area={alert.area} data-check={alert.check}
              data-blocks={counts.blocks} data-degrades={counts.degrades}
              onClick={() => (onOpenSettings ? onOpenSettings() : onOpenStory())}>{hudSetupText(counts)}</button>
          ) : null}
          {pending > 0 ? <span className="so-hud-pending">{hudPendingText(pending)}</span> : null}
          {sheet && sheetAvailable && (
            <IconButton id="so-hud-sheet" data-so="hud-sheet" size="sm" icon="fa-book-open" label={sheet.open ? SHEET_TEXT.close : SHEET_TEXT.open}
              aria-expanded={sheet.open} aria-controls={sheet.open ? "so-sheet" : undefined} onClick={sheet.toggle} />
          )}
        </div>
      </div>
    </>
  );
};

export default HudStrip;

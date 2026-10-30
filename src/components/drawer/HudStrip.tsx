import { useCallback, useRef, useState } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { branchNoticeText, PLAYER_COPY, rollbackNoticeText, yourMoveAuthorTitle } from "@runtime/narrative";
import { busyText, HUD_COPY, hudChipLabel, hudPendingText, hudSetupText, hudSetupTitle, hudTensionText, playerPendingCount } from "@runtime/pipeline";
import { setupAlert, setupCounts } from "@runtime/repair";
import type { RuntimeSnapshot } from "@runtime/types";
import type { HudCardActions } from "./HudCard";

const HudCard = lazyRetry(() => import("./HudCard"));
const MediaPending = lazyRetry(() => import("../MediaPending"));

export interface HudStripProps {
  snapshot: RuntimeSnapshot;
  onOpenStory: () => void;
  onOpenSettings?: () => void;
  card?: HudCardActions;
}

export const HudStrip = ({ snapshot, onOpenStory, onOpenSettings, card }: HudStripProps) => {
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
  const chip = working ?? (snapshot.pipeline.state === "not-configured" && !snapshot.lastRollback ? null : hudChipLabel(snapshot.pipeline.state, Boolean(snapshot.lastRollback)));
  const alert = chip ? null : setupAlert(snapshot);
  const counts = setupCounts(snapshot);
  return (
    <>
      {snapshot.busy?.some((job) => job.kind === "image" || job.kind === "sprite") && <Lazy fallback={null}><MediaPending jobs={snapshot.busy} /></Lazy>}
      {card && open && (
        <Lazy fallback={null}>
          <HudCard snapshot={snapshot} panels={card.panels} openPanel={card.openPanel} openMemory={card.openMemory} onMore={onOpenStory} onClose={close} />
        </Lazy>
      )}
      <div id="so-hud">
        <button ref={main} id="so-hud-main" type="button" className="so-hud-main" title={card ? HUD_COPY.open : PLAYER_COPY.openDrawer}
          aria-expanded={card ? open : undefined} aria-controls={card && open ? "so-hud-card" : undefined}
          onClick={() => (card ? setOpen((current) => !current) : onOpenStory())}>
          <span className="so-hud-name">◈ {snapshot.narrative?.headline ?? HUD_COPY.fallbackScene}</span>
          {snapshot.ui.authorView && snapshot.activeCheckpointName && snapshot.activeCheckpointName !== snapshot.narrative?.headline
            ? <span className="so-hud-dim" data-so="hud-author-checkpoint">{snapshot.activeCheckpointName}</span> : null}
          {snapshot.tension.level ? <span className="so-hud-dim">{hudTensionText(snapshot.tension.level)}</span> : null}
        </button>
        {snapshot.turn?.yours ? (
          <span id="so-hud-turn" className="so-hud-chip" role="status"
            title={snapshot.ui.authorView && snapshot.turn.source ? yourMoveAuthorTitle(snapshot.turn.source) : PLAYER_COPY.yourMoveTitle}>{PLAYER_COPY.yourMove}</span>
        ) : null}
        {chip ? (
          <button
             id="so-hud-pipeline"
             aria-busy={Boolean(working)}
            type="button"
            className="so-hud-chip"
            title={snapshot.lastRollback ? rollbackNoticeText(snapshot.lastRollback) : snapshot.ui.authorView ? snapshot.pipeline.detail ?? snapshot.pipeline.text : snapshot.pipeline.text}
            onClick={() => (snapshot.pipeline.needsSetup && onOpenSettings ? onOpenSettings() : onOpenStory())}
          >
            {chip}
          </button>
        ) : alert ? (
          <button id="so-hud-setup" type="button" className="so-hud-chip" title={`${hudSetupTitle(counts)} ${alert.consequence}`} data-area={alert.area} data-check={alert.check}
            data-blocks={counts.blocks} data-degrades={counts.degrades}
            onClick={() => (onOpenSettings ? onOpenSettings() : onOpenStory())}>{hudSetupText(counts)}</button>
        ) : null}
        {pending > 0 ? <span className="so-hud-pending">{hudPendingText(pending)}</span> : null}
      </div>
    </>
  );
};

export default HudStrip;

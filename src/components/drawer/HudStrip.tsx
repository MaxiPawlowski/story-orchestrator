import { branchNoticeText, rollbackNoticeText } from "@runtime/narrative";
import { HUD_COPY, hudChipLabel, hudPendingText, hudTensionText, playerPendingCount } from "@runtime/pipeline";
import type { RuntimeSnapshot } from "@runtime/types";

export interface HudStripProps {
  snapshot: RuntimeSnapshot;
  onOpenDrawer: () => void;
  onOpenSettings?: () => void;
}

export const HudStrip = ({ snapshot, onOpenDrawer, onOpenSettings }: HudStripProps) => {
  if (!snapshot.ui.hudEnabled) return null;
  const branch = snapshot.chatIdentity?.kind === "branch" ? snapshot.chatIdentity : null;
  if (!snapshot.ready && branch) {
    return (
      <div id="so-hud">
        <button id="so-hud-branch" type="button" className="so-hud-chip" title={branchNoticeText(null)} onClick={onOpenDrawer}>{HUD_COPY.branchChip}</button>
      </div>
    );
  }
  if (!snapshot.ready) return null;
  const pending = playerPendingCount(snapshot.pendingDeltas);
  const chip = hudChipLabel(snapshot.pipeline.state, Boolean(snapshot.lastRollback));
  return (
    <div id="so-hud">
      <button type="button" className="so-hud-main" title={HUD_COPY.open} onClick={onOpenDrawer}>
        <span className="so-hud-name">◈ {snapshot.narrative?.sections.find((section) => section.id === "now")?.lines[0] ?? HUD_COPY.fallbackScene}</span>
        {snapshot.tension.level ? <span className="so-hud-dim">{hudTensionText(snapshot.tension.level)}</span> : null}
      </button>
      {chip ? (
        <button
          id="so-hud-pipeline"
          type="button"
          className="so-hud-chip"
          title={snapshot.lastRollback ? rollbackNoticeText(snapshot.lastRollback) : snapshot.ui.authorView ? snapshot.pipeline.detail ?? snapshot.pipeline.text : snapshot.pipeline.text}
          onClick={() => (snapshot.pipeline.needsSetup && onOpenSettings ? onOpenSettings() : onOpenDrawer())}
        >
          {chip}
        </button>
      ) : null}
      {pending > 0 ? <span className="so-hud-pending">{hudPendingText(pending)}</span> : null}
    </div>
  );
};

export default HudStrip;

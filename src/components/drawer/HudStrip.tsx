import { branchNoticeText, rollbackNoticeText } from "@runtime/narrative";
import type { RuntimeSnapshot } from "@runtime/types";

export interface HudStripProps {
  snapshot: RuntimeSnapshot;
  onOpenDrawer: () => void;
  onOpenSettings?: () => void;
}

// One glance: where the story is, how it feels, what it has heard, and — only when it matters —
// that it is catching up, stuck or not set up yet (U5/U6).
const CHIP_LABELS: Partial<Record<RuntimeSnapshot["pipeline"]["state"], string>> = {
  "stalled-rechecking": "catching up…",
  "not-configured": "needs setup",
  error: "not keeping up",
};

export const HudStrip = ({ snapshot, onOpenDrawer, onOpenSettings }: HudStripProps) => {
  if (!snapshot.ui.hudEnabled) return null;
  const branch = snapshot.chatIdentity?.kind === "branch" ? snapshot.chatIdentity : null;
  if (!snapshot.ready && branch) {
    return (
      <div id="so-hud">
        <button id="so-hud-branch" type="button" className="so-hud-chip" title={branchNoticeText(branch.checkpointName)} onClick={onOpenDrawer}>branch — continue?</button>
      </div>
    );
  }
  if (!snapshot.ready) return null;
  const pending = snapshot.pendingDeltas.length;
  const chip = snapshot.lastRollback ? "stepped back" : CHIP_LABELS[snapshot.pipeline.state];
  return (
    <div id="so-hud">
      <button type="button" className="so-hud-main" title="Open Story Orchestrator" onClick={onOpenDrawer}>
        <span className="so-hud-name">◈ {snapshot.activeCheckpointName}</span>
        {snapshot.tension.level ? <span className="so-hud-dim">tension {snapshot.tension.level}</span> : null}
      </button>
      {chip ? (
        <button
          id="so-hud-pipeline"
          type="button"
          className="so-hud-chip"
          title={snapshot.lastRollback ? rollbackNoticeText(snapshot.lastRollback) : snapshot.pipeline.detail ?? snapshot.pipeline.text}
          onClick={() => (snapshot.pipeline.needsSetup && onOpenSettings ? onOpenSettings() : onOpenDrawer())}
        >
          {chip}
        </button>
      ) : null}
      {pending > 0 ? <span className="so-hud-pending">{pending} update{pending === 1 ? "" : "s"} next turn</span> : null}
    </div>
  );
};

export default HudStrip;

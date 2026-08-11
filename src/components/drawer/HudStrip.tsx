import type { RuntimeSnapshot } from "@runtime/types";

export interface HudStripProps {
  snapshot: RuntimeSnapshot;
  onOpenDrawer: () => void;
}

export const HudStrip = ({ snapshot, onOpenDrawer }: HudStripProps) => {
  if (!snapshot.ready || !snapshot.ui.hudEnabled) return null;
  const pending = snapshot.pendingDeltas.length;
  return (
    <button id="so-hud" type="button" onClick={onOpenDrawer} title="Open Story Orchestrator">
      <span className="so-hud-name">◈ {snapshot.activeCheckpointName}</span>
      {snapshot.tension.level ? <span className="so-hud-dim">tension {snapshot.tension.level}</span> : null}
      {pending > 0 ? <span className="so-hud-pending">{pending} update{pending === 1 ? "" : "s"} next turn</span> : null}
    </button>
  );
};

export default HudStrip;

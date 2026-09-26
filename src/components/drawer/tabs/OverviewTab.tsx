import type { RuntimeSnapshot } from "@runtime/types";
import PlayerOverview from "../PlayerOverview";
import ScenePanel from "../ScenePanel";

const extractionReady = (snapshot: RuntimeSnapshot): boolean => snapshot.extraction.settings.enabled && Boolean(snapshot.extraction.settings.profileId);

const StatusDot = ({ ok }: { ok: boolean }) => <span className={`status-indicator status-${ok ? "success" : "error"}`} />;

// Diagnose-only dots were the half of this panel: the wizard turns them into a next step it can
// actually take — create the missing cards, lorebook and group. Personas stay diagnostic.
const AuthorRequirements = ({ snapshot, onFixWithWizard }: { snapshot: RuntimeSnapshot; onFixWithWizard?: () => void }) => {
  const items = [
    { label: "Persona", missing: snapshot.requirements.missingPersonas },
    { label: "Group", missing: snapshot.requirements.missingMembers },
    { label: "Lore", missing: snapshot.requirements.missingLorebooks },
  ];
  const ready = extractionReady(snapshot);
  const provisionable = snapshot.requirements.missingMembers.length + snapshot.requirements.missingLorebooks.length > 0;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-2"><StatusDot ok={item.missing.length === 0} /><span>{item.label}</span></div>
          {item.missing.length > 0 && <div className="text-xs opacity-80">Missing: {item.missing.join(", ")}</div>}
        </div>
      ))}
      {provisionable && onFixWithWizard && (
        <button
          id="so-fix-with-wizard"
          className="menu_button self-start"
          title="Open the wizard on the provisioning step, pre-filled with what this story is missing."
          onClick={onFixWithWizard}
        >Fix with wizard</button>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2"><StatusDot ok={ready} /><span>Extraction</span></div>
        {!ready && <div className="text-xs opacity-80">Off — the story will not advance on its own. Enable it and pick a model profile in settings.</div>}
      </div>
    </div>
  );
};

// Author-only machine view of the same checkpoint: ids, counters, gate progress and the raw
// pending queue. Convergence is a spoiler by construction (it names a future anchor), so it never
// appears without author view.
// An edit past the retained history cannot be rewound here,
// but a branch cut at the floor starts exactly there, and its Continue from here restores it. Author view
// only until a player session has looked at it (rule 7).
const HistoryFloor = ({ snapshot, onBranchFromOldest }: { snapshot: RuntimeSnapshot; onBranchFromOldest?: (messageId: number) => void }) => {
  const oldest = snapshot.rollbackUnavailable?.oldest;
  if (!oldest || !onBranchFromOldest) return null;
  return (
    <div id="so-history-floor" className="text-xs opacity-80">
      <div className="font-medium opacity-100">History floor</div>
      <div>Oldest restorable point: boundary {oldest.boundary}, message {oldest.messageId}</div>
      <button
        id="so-branch-from-oldest"
        type="button"
        className="menu_button"
        disabled={oldest.messageId < 0}
        onClick={() => onBranchFromOldest(oldest.messageId)}
      >Branch from the oldest restorable point</button>
    </div>
  );
};

const AuthorOverview = ({ snapshot, onFixWithWizard, onBranchFromOldest }: { snapshot: RuntimeSnapshot; onFixWithWizard?: () => void; onBranchFromOldest?: (messageId: number) => void }) => (
  <div className="flex flex-col gap-3 border-t border-solid border-white/10 pt-2">
    <HistoryFloor snapshot={snapshot} onBranchFromOldest={onBranchFromOldest} />
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Engine</div>
      <div>{snapshot.activeCheckpointId} · boundary {snapshot.boundary}</div>
      <div>Pipeline: {snapshot.pipeline.state}{snapshot.pipeline.detail ? ` — ${snapshot.pipeline.detail}` : ""}</div>
    </div>
    {snapshot.pendingDeltas.length > 0 && (
      <div className="text-xs opacity-80">
        <div className="font-medium opacity-100">Pending writes</div>
        {snapshot.pendingDeltas.map((pending) => <div key={pending.quality}>{pending.quality} → {String(pending.value)}</div>)}
      </div>
    )}
    <AuthorRequirements snapshot={snapshot} onFixWithWizard={onFixWithWizard} />
    <ScenePanel scene={snapshot.scene} />
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Tension</div>
      <div>Level: {snapshot.tension.level ?? "—"} {snapshot.tension.smoothed !== null && <span>({snapshot.tension.smoothed.toFixed(2)})</span>}</div>
      <div>Expected: {snapshot.tension.expected !== null ? snapshot.tension.expected.toFixed(2) : "—"}</div>
      {snapshot.tension.hint && <div className="opacity-100">Steering: {snapshot.tension.hint.direction} — {snapshot.tension.hint.text}</div>}
    </div>
    {snapshot.convergence.length > 0 && (
      <div className="text-xs opacity-80">
        <div className="font-medium opacity-100">Convergence</div>
        {snapshot.convergence.map((entry) => {
          const pct = entry.threshold > 0 ? Math.min(100, Math.round((entry.progress / entry.threshold) * 100)) : 100;
          return (
            <div key={entry.anchorId} className="border-t border-solid border-white/10 mt-1 pt-1">
              <div>{entry.anchorName}{entry.visited ? " · visited" : ""}{entry.reached ? " ✔" : ""}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/10 rounded">
                  <div className="h-full bg-white/60 rounded" style={{ width: `${pct}%` }} />
                </div>
                <span>{entry.progress}/{entry.threshold}</span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export const OverviewTab = ({ snapshot, authorView, onOpenSettings, onFixWithWizard, onReread, onRestart, onRetry, onBranchFromOldest }: {
  snapshot: RuntimeSnapshot;
  authorView: boolean;
  onOpenSettings?: () => void;
  onFixWithWizard?: () => void;
  onReread?: () => void;
  onRestart?: () => void;
  onRetry?: () => void;
  onBranchFromOldest?: (messageId: number) => void;
}) => (
  <div className="flex flex-col gap-3">
    <PlayerOverview snapshot={snapshot} onOpenSettings={onOpenSettings} onReread={onReread} onRestart={onRestart} onRetry={onRetry} />
    {authorView && <AuthorOverview snapshot={snapshot} onFixWithWizard={onFixWithWizard} onBranchFromOldest={onBranchFromOldest} />}
  </div>
);

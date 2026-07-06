import { useState } from "react";
import { MEMORY_TIERS, type MemoryTier } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import DriverPanel, { type DriverController } from "../../studio/components/DriverPanel";

export type DrawerTabId = "overview" | "blackboard" | "memory" | "scheduler" | "payload";

const MEMORY_TIER_LABELS: Record<MemoryTier, string> = {
  facts: "Facts",
  session_details: "Session details",
  short_term: "Short-term",
  scene_history: "Scene history",
};

const EPISTEMIC_TAG_LABELS: Record<string, string> = { knows: "knows", suspects: "suspects", believes: "believes (false)", unaware: "unaware", hiding: "hiding" };

const TABS: Array<{ id: DrawerTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "blackboard", label: "Blackboard" },
  { id: "memory", label: "Memory" },
  { id: "scheduler", label: "Scheduler" },
  { id: "payload", label: "Payload" },
];

export interface DrawerDriver {
  context: ReturnType<RuntimeManager["getDriverContext"]>;
  activeNudge: string | null;
  controller: DriverController;
}

export interface DrawerTabsProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  driver: DrawerDriver;
}

const StatusDot = ({ ok }: { ok: boolean }) => <span className={`status-indicator status-${ok ? "success" : "error"}`} />;

const Requirements = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const items = [
    { label: "Persona", missing: snapshot.requirements.missingPersonas },
    { label: "Group", missing: snapshot.requirements.missingMembers },
    { label: "Lore", missing: snapshot.requirements.missingLorebooks },
  ];
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-2"><StatusDot ok={item.missing.length === 0} /><span>{item.label}</span></div>
          {item.missing.length > 0 && <div className="text-xs opacity-80">Missing: {item.missing.join(", ")}</div>}
        </div>
      ))}
    </div>
  );
};

const OverviewTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div className="flex flex-col gap-3">
    <div className="checkpoints-wrapper flex flex-col gap-1">
      <div className="font-medium">Checkpoint</div>
      <div className="st-checkpoint-row status-current">
        <div className="font-semibold">{snapshot.activeCheckpointName}</div>
        <div className="text-sm opacity-80">{snapshot.activeObjective}</div>
        <div className="text-xs opacity-70">Boundary {snapshot.boundary}</div>
      </div>
    </div>
    <Requirements snapshot={snapshot} />
    <div className="flex flex-col gap-1">
      <div className="font-medium">Tension</div>
      <div className="text-xs opacity-80">
        <div>Level: {snapshot.tension.level ?? "—"} {snapshot.tension.smoothed !== null && <span>({snapshot.tension.smoothed.toFixed(2)})</span>}</div>
        <div>Expected: {snapshot.tension.expected !== null ? snapshot.tension.expected.toFixed(2) : "—"}</div>
        {snapshot.tension.hint && <div className="opacity-100">Steering: {snapshot.tension.hint.direction} — {snapshot.tension.hint.text}</div>}
      </div>
    </div>
    {snapshot.convergence.length > 0 && (
      <div className="text-xs opacity-80">
        <div className="font-medium opacity-100">Convergence</div>
        {snapshot.convergence.map((entry) => {
          const pct = entry.threshold > 0 ? Math.min(100, Math.round((entry.progress / entry.threshold) * 100)) : 100;
          return (
            <div key={entry.anchorId} className="border-t border-solid border-white/10 mt-1 pt-1">
              <div>{entry.anchorName}{entry.reached ? " ✔" : ""}</div>
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

const BlackboardTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div>
    <div className="font-medium mb-1">Blackboard</div>
    {Object.keys(snapshot.blackboard).length === 0 ? (
      <div className="text-xs opacity-70">No blackboard values yet.</div>
    ) : (
      <table className="w-full text-xs">
        <thead><tr><th className="text-left">Key</th><th className="text-left">Value</th><th className="text-left">Source</th></tr></thead>
        <tbody>
          {Object.entries(snapshot.blackboard).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{String(value)}</td>
              <td title={snapshot.blackboardMeta[key]?.evidence ?? ""}>{snapshot.blackboardMeta[key]?.source}{snapshot.blackboardMeta[key]?.latched ? " locked" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const MemoryTab = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const [characterFilter, setCharacterFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const characterIds = Array.from(new Set(snapshot.memory.entries.map((entry) => entry.characterId).filter((id): id is string => Boolean(id)))).sort();
  const filtered = characterFilter ? snapshot.memory.entries.filter((entry) => entry.characterId === characterFilter) : snapshot.memory.entries;
  const lastAudit = snapshot.extraction.audits[snapshot.extraction.audits.length - 1];

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setDraftText(text);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    await manager.editMemoryEntry(editingId, draftText);
    setEditingId(null);
  };

  return (
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Memory</div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={snapshot.memory.settings.enabled} onChange={(event) => manager.setMemorySettings({ enabled: event.target.checked })} />
        <span>Enabled</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={snapshot.memory.settings.epistemicLedgerCapable} onChange={(event) => manager.setEpistemicLedgerCapable(event.target.checked)} />
        <span>Epistemic/ledger extraction (model-capable)</span>
      </label>
      <div className="opacity-60">Turn off only if your memory model over-infers who knows what or invents entity state — small local models tend to. Never disable purely to save calls.</div>
      <div>Scene count {snapshot.memory.sceneCount}</div>
      {snapshot.memory.backfill?.running && <div>Memorizing: {snapshot.memory.backfill.processed}/{snapshot.memory.backfill.total}</div>}
      {snapshot.memory.backfill?.lastError && <div className="text-red-300">{snapshot.memory.backfill.lastError}</div>}
      {lastAudit && <div title={`${lastAudit.prompt}\n---\n${lastAudit.rawResponse}`}>Last audit: {lastAudit.id} ({lastAudit.reason})</div>}
      {characterIds.length > 0 && (
        <label className="flex items-center gap-2 mt-1">
          <span>Character</span>
          <select value={characterFilter} onChange={(event) => setCharacterFilter(event.target.value)}>
            <option value="">All</option>
            {characterIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      )}
      {MEMORY_TIERS.map((tier) => {
        const entries = filtered.filter((entry) => entry.tier === tier);
        if (!entries.length) return null;
        return (
          <div key={tier} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{MEMORY_TIER_LABELS[tier]} ({entries.length})</div>
            {entries.map((entry) => (
              <div key={entry.id} className="mt-1">
                {editingId === entry.id ? (
                  <div className="flex flex-col gap-1">
                    <textarea className="text_pole" rows={2} value={draftText} onChange={(event) => setDraftText(event.target.value)} />
                    <div className="flex gap-2">
                      <button className="menu_button" onClick={() => void saveEdit()}>Save</button>
                      <button className="menu_button" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div title={entry.evidence} className={entry.supersededBy || entry.foldedInto ? "opacity-40 line-through" : ""}>{entry.text}{entry.pinned ? " 📌" : ""}{entry.characterId ? ` (${entry.characterId})` : ""}</div>
                    <div className="flex gap-2 opacity-80 flex-wrap">
                      <span>imp {entry.importance} · {entry.expiration}</span>
                      {entry.supersededBy && <span title={`superseded by ${entry.supersededBy}`}>⤳ superseded</span>}
                      {entry.foldedInto && <span title={`folded into ${entry.foldedInto}`}>🗜 folded</span>}
                      {entry.contradicted && !entry.supersededBy && <span>⚠ contradicted</span>}
                      {entry.recallCount > 0 && <span>recall {entry.recallCount}</span>}
                      <button className="menu_button" onClick={() => void manager.setMemoryPinned(entry.id, !entry.pinned)}>{entry.pinned ? "Unpin" : "Pin"}</button>
                      <button className="menu_button" onClick={() => startEdit(entry.id, entry.text)}>Edit</button>
                      <button className="menu_button" onClick={() => void manager.excludeMemoryEntry(entry.id)}>Exclude</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        );
      })}
      <ArcCanonPanel snapshot={snapshot} manager={manager} />
      <EpistemicPanel snapshot={snapshot} manager={manager} />
      <LedgerPanel snapshot={snapshot} manager={manager} />
    </div>
  );
};

const EpistemicPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const entries = (snapshot.memory.epistemic ?? []).filter((entry) => !entry.supersededBy);
  if (!entries.length) return null;
  const subjects = Array.from(new Set(entries.map((entry) => entry.subject)));
  return (
    <div className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">Epistemic map ({entries.length})</div>
      {subjects.map((subject) => (
        <div key={subject} className="mt-1">
          <div className="opacity-100">{subject}</div>
          {entries.filter((entry) => entry.subject === subject).map((entry) => (
            <div key={entry.id} className="flex gap-2 opacity-80 flex-wrap">
              <span>[{EPISTEMIC_TAG_LABELS[entry.tag] ?? entry.tag}{entry.hiddenFrom ? ` from ${entry.hiddenFrom}` : ""}] {entry.content}{entry.pinned ? " 📌" : ""}</span>
              <button className="menu_button" onClick={() => void manager.setEpistemicPinned(entry.id, !entry.pinned)}>{entry.pinned ? "Unpin" : "Pin"}</button>
              <button className="menu_button" onClick={() => void manager.removeEpistemicEntry(entry.id)}>Remove</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

const LedgerPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const stored = snapshot.memory.ledger ?? [];
  const rows = manager.getLedger();
  if (!rows.length) return null;
  const entities = Array.from(new Set(rows.map((row) => row.entity)));
  const idFor = (entity: string, field: string) => stored.find((entry) => entry.entity.toLowerCase() === entity.toLowerCase() && entry.field.toLowerCase() === field.toLowerCase())?.id;
  return (
    <div className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">State ledger ({rows.length})</div>
      {entities.map((entity) => (
        <div key={entity} className="mt-1">
          <div className="opacity-100">{entity}</div>
          {rows.filter((row) => row.entity === entity).map((row) => {
            const id = row.bound ? undefined : idFor(row.entity, row.field);
            return (
              <div key={`${entity}-${row.field}`} className="flex gap-2 opacity-80 flex-wrap">
                <span>{row.field}={row.value}{row.bound ? " 🔒" : ""}</span>
                {row.bound && <span className="opacity-60" title="mirrored read-only from a blackboard quality">blackboard</span>}
                {id && <button className="menu_button" onClick={() => void manager.removeLedgerEntry(id)}>Remove</button>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const ArcCanonPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const arcs = snapshot.memory.arcs ?? [];
  const openArcs = arcs.filter((arc) => arc.status === "open");
  const resolvedArcs = arcs.filter((arc) => arc.status === "resolved");
  const canon = snapshot.memory.canon;
  if (!arcs.length && !canon) return null;
  return (
    <div className="border-t border-solid border-white/10 mt-1 pt-1">
      <div className="opacity-100">Arcs (open {openArcs.length} · resolved {resolvedArcs.length})</div>
      {arcs.map((arc) => (
        <div key={arc.id} className="mt-1">
          <div className={arc.status === "resolved" ? "opacity-60" : ""}>{arc.status === "resolved" ? "✓ " : "◦ "}{arc.text}{arc.pinned ? " 📌" : ""}</div>
          {arc.summary && <div className="opacity-70 italic">{arc.summary}</div>}
          <div className="flex gap-2 opacity-80 flex-wrap">
            <button className="menu_button" onClick={() => void manager.setArcPinned(arc.id, !arc.pinned)}>{arc.pinned ? "Unpin" : "Pin"}</button>
            <button className="menu_button" onClick={() => void manager.removeArc(arc.id)}>Remove</button>
          </div>
        </div>
      ))}
      {canon && (
        <div className="border-t border-solid border-white/10 mt-1 pt-1">
          <div className="opacity-100">Canon</div>
          <div className="opacity-80 whitespace-pre-wrap">{canon.text}</div>
        </div>
      )}
    </div>
  );
};

const SchedulerTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div className="flex flex-col gap-3">
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Extraction</div>
      <div>Queue {snapshot.extraction.scheduler.queueDepth}, in flight {snapshot.extraction.scheduler.inFlight ? "yes" : "no"}</div>
      <div>Last read boundary {snapshot.extraction.lastReadBoundary}</div>
      {snapshot.extraction.scheduler.lastError && <div className="text-red-300">{snapshot.extraction.scheduler.lastError}</div>}
      {snapshot.extraction.audits[0] && <div>Last scope: {snapshot.extraction.audits[snapshot.extraction.audits.length - 1]?.scope.join(", ") || "none"}</div>}
      <div>Audits recorded {snapshot.extraction.audits.length}</div>
    </div>
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Expansion</div>
      <div>Queue {snapshot.expansion.scheduler.queueDepth}, in flight {snapshot.expansion.scheduler.inFlight ? "yes" : "no"}</div>
      {snapshot.expansion.scheduler.lastError && <div className="text-red-300">{snapshot.expansion.scheduler.lastError}</div>}
      {Object.values(snapshot.expansion.entries).map((entry) => (
        <div key={entry.key} className="border-t border-solid border-white/10 mt-1 pt-1">
          <div>{entry.stubId} → {entry.targetAnchorId}: {entry.status}{entry.needsReview ? " review" : ""}</div>
          <div>{entry.beats.length} beats{entry.lastError ? ` — ${entry.lastError}` : ""}</div>
          {entry.beats.slice(0, 3).map((beat) => <div key={beat.objective}>- {beat.objective}</div>)}
        </div>
      ))}
    </div>
  </div>
);

const PayloadTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const captures = snapshot.payloadCaptures;
  return (
    <div className="text-xs opacity-80 flex flex-col gap-2">
      <div className="font-medium opacity-100">Injected prompt payload</div>
      {captures.length === 0 ? (
        <div className="opacity-70">No captures yet. Blocks are recorded when a generation starts.</div>
      ) : (
        captures.map((capture, index) => (
          <div key={capture.at} className="border-t border-solid border-white/10 pt-1">
            <div className="opacity-100">{index === 0 ? "Latest" : capture.at} · boundary {capture.boundary} · {capture.reason} · {capture.blocks.length} blocks</div>
            {capture.blocks.length === 0 ? (
              <div className="opacity-60">No story blocks injected for this generation.</div>
            ) : (
              capture.blocks.map((block) => (
                <div key={block.key} className="mt-1">
                  <div className="opacity-100">{block.key} <span className="opacity-60">@depth {block.depth}</span></div>
                  <div className="whitespace-pre-wrap opacity-80">{block.value}</div>
                </div>
              ))
            )}
          </div>
        ))
      )}
    </div>
  );
};

export const DrawerTabs = ({ snapshot, manager, driver }: DrawerTabsProps) => {
  const [active, setActive] = useState<DrawerTabId>("overview");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Story Orchestrator debug tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            className={`menu_button ${active === tab.id ? "" : "opacity-60"}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {active === "overview" && <OverviewTab snapshot={snapshot} />}
        {active === "blackboard" && <BlackboardTab snapshot={snapshot} />}
        {active === "memory" && <MemoryTab snapshot={snapshot} manager={manager} />}
        {active === "scheduler" && <SchedulerTab snapshot={snapshot} />}
        {active === "payload" && <PayloadTab snapshot={snapshot} />}
      </div>
      {snapshot.copilot.enabled && (
        <div className="border-t border-solid border-white/10 pt-2">
          <DriverPanel context={driver.context} checkpoints={snapshot.checkpoints} activeNudge={driver.activeNudge} controller={driver.controller} />
        </div>
      )}
    </div>
  );
};

export default DrawerTabs;

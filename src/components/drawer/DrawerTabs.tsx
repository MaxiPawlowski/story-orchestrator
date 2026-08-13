import { useState } from "react";
import { MEMORY_TIERS, type MemoryTier } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import DriverPanel, { type DriverController } from "./DriverPanel";
import PlayerOverview from "./PlayerOverview";

export type DrawerTabId = "overview" | "blackboard" | "memory" | "scheduler" | "payload";

const MEMORY_TIER_LABELS: Record<MemoryTier, string> = {
  facts: "Facts",
  session_details: "Session details",
  short_term: "Short-term",
  scene_history: "Scene history",
};

const EPISTEMIC_TAG_LABELS: Record<string, string> = { knows: "knows", suspects: "suspects", believes: "believes (false)", unaware: "unaware", hiding: "hiding" };

const TABS: Array<{ id: DrawerTabId; label: string; authorOnly?: boolean }> = [
  { id: "overview", label: "Overview" },
  { id: "blackboard", label: "Blackboard", authorOnly: true },
  { id: "memory", label: "Memory" },
  { id: "scheduler", label: "Scheduler", authorOnly: true },
  { id: "payload", label: "Payload", authorOnly: true },
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
  onOpenSettings?: () => void;
  onEditStory?: () => void;
}

const extractionReady = (snapshot: RuntimeSnapshot): boolean => snapshot.extraction.settings.enabled && Boolean(snapshot.extraction.settings.profileId);

const StatusDot = ({ ok }: { ok: boolean }) => <span className={`status-indicator status-${ok ? "success" : "error"}`} />;

const AuthorRequirements = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const items = [
    { label: "Persona", missing: snapshot.requirements.missingPersonas },
    { label: "Group", missing: snapshot.requirements.missingMembers },
    { label: "Lore", missing: snapshot.requirements.missingLorebooks },
  ];
  const ready = extractionReady(snapshot);
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-2"><StatusDot ok={item.missing.length === 0} /><span>{item.label}</span></div>
          {item.missing.length > 0 && <div className="text-xs opacity-80">Missing: {item.missing.join(", ")}</div>}
        </div>
      ))}
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
const AuthorOverview = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div className="flex flex-col gap-3 border-t border-solid border-white/10 pt-2">
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
    <AuthorRequirements snapshot={snapshot} />
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

const OverviewTab = ({ snapshot, authorView, onOpenSettings }: { snapshot: RuntimeSnapshot; authorView: boolean; onOpenSettings?: () => void }) => (
  <div className="flex flex-col gap-3">
    <PlayerOverview snapshot={snapshot} onOpenSettings={onOpenSettings} />
    {authorView && <AuthorOverview snapshot={snapshot} />}
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
              <td title={snapshot.blackboardMeta[key]?.evidence ?? ""}>{snapshot.blackboardMeta[key]?.source}{snapshot.blackboardMeta[key]?.latched ? " (locked)" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

const MemoryTab = ({ snapshot, manager, authorView }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; authorView: boolean }) => {
  const [characterFilter, setCharacterFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const characterIds = Array.from(new Set(snapshot.memory.entries.map((entry) => entry.characterId).filter((id): id is string => Boolean(id)))).sort();
  const filtered = characterFilter ? snapshot.memory.entries.filter((entry) => entry.characterId === characterFilter) : snapshot.memory.entries;
  // Superseded and folded entries are bookkeeping: the player curates established facts only.
  const visible = authorView ? filtered : filtered.filter((entry) => !entry.supersededBy && !entry.foldedInto);
  const lastAudit = snapshot.extraction.audits[snapshot.extraction.audits.length - 1];

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setDraftText(text);
  };

  const excludeWithUndo = async (id: string) => {
    const entry = snapshot.memory.entries.find((candidate) => candidate.id === id);
    await manager.excludeMemoryEntry(id);
    if (!entry) return;
    window.toastr?.info?.("Memory excluded — click here to undo", "Story Orchestrator", {
      timeOut: 8000,
      onclick: () => { void manager.restoreMemoryEntry(entry); },
    });
  };
  const saveEdit = async () => {
    if (!editingId) return;
    await manager.editMemoryEntry(editingId, draftText);
    setEditingId(null);
  };

  return (
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">What the story remembers</div>
      {authorView && (
        <>
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
        </>
      )}
      <div className="flex items-center gap-2 mt-1">
        <button className="menu_button" disabled={snapshot.memory.backfill?.running} onClick={() => void manager.runMemorizeBacklog()}>Memorize chat</button>
        <span className="opacity-60">Read the whole chat history into memory.</span>
      </div>
      {snapshot.memory.backfill?.running && <div>Memorizing: {snapshot.memory.backfill.processed}/{snapshot.memory.backfill.total}</div>}
      {snapshot.memory.backfill?.lastError && <div className="text-red-300">{snapshot.memory.backfill.lastError}</div>}
      {authorView && lastAudit && <div title={`${lastAudit.prompt}\n---\n${lastAudit.rawResponse}`}>Last audit: {lastAudit.id} ({lastAudit.reason})</div>}
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
        const entries = visible.filter((entry) => entry.tier === tier);
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
                      {authorView && <span>importance {entry.importance} · {entry.expiration}</span>}
                      {authorView && entry.supersededBy && <span title={`superseded by ${entry.supersededBy}`}>⤳ superseded</span>}
                      {authorView && entry.foldedInto && <span title={`folded into ${entry.foldedInto}`}>🗜 folded</span>}
                      {authorView && entry.contradicted && !entry.supersededBy && <span>⚠ contradicted</span>}
                      {authorView && entry.recallCount > 0 && <span>recall {entry.recallCount}</span>}
                      <button className="menu_button" onClick={() => void manager.setMemoryPinned(entry.id, !entry.pinned)}>{entry.pinned ? "Unpin" : "Pin"}</button>
                      <button className="menu_button" onClick={() => startEdit(entry.id, entry.text)}>Edit</button>
                      <button className="menu_button" onClick={() => void excludeWithUndo(entry.id)}>Exclude</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {authorView && (
        <>
          <ArcCanonPanel snapshot={snapshot} manager={manager} />
          <EpistemicPanel snapshot={snapshot} manager={manager} />
          <LedgerPanel snapshot={snapshot} manager={manager} />
        </>
      )}
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
  const rows = snapshot.ledger;
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

const TALK_SOURCE_LABELS: Record<string, string> = {
  mention: "name mention",
  director: "LLM director",
  rules: "weighted rules",
  fallback: "rules fallback",
};

const TalkDecisionsPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const decisions = [...snapshot.talk.decisions].reverse();
  return (
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Speaker direction</div>
      {!snapshot.talk.enabled && <div className="opacity-70">Disabled in settings.</div>}
      {decisions.length === 0 ? (
        <div className="opacity-70">No decisions yet. Recorded when a talk-control checkpoint picks the next speaker.</div>
      ) : (
        decisions.map((decision) => (
          <div key={`${decision.checkpointId}-${decision.messageId}-${decision.at}`} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{decision.chosenName ?? "silence"} <span className="opacity-60">via {TALK_SOURCE_LABELS[decision.source] ?? decision.source}</span></div>
            <div>msg {decision.messageId} · {decision.checkpointId} · {decision.latencyMs} ms</div>
          </div>
        ))
      )}
    </div>
  );
};

// The author half of the stall signal (U5): the player sees "catching up", the author sees which
// keys the re-read is chasing and what it came back with.
const ReconciliationPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const events = [...snapshot.extraction.reconciliationEvents].reverse();
  return (
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Stall re-checks</div>
      {events.length === 0 ? (
        <div className="opacity-70">None. Queued when a checkpoint overstays its target length with gate qualities still unmet.</div>
      ) : (
        events.map((event) => (
          <div key={`${event.id}-${event.scheduledAt}`} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{event.resolvedAt ? "✔ resolved" : "… pending"} · boundary {event.boundary} · {event.checkpointId}</div>
            <div>chasing {event.targetedKeys.join(", ") || "recent scenes"}</div>
            {event.evidence.map((line) => <div key={line} className="opacity-70">{line}</div>)}
          </div>
        ))
      )}
    </div>
  );
};

const SchedulerTab = ({ snapshot }: { snapshot: RuntimeSnapshot }) => (
  <div className="flex flex-col gap-3">
    <TalkDecisionsPanel snapshot={snapshot} />
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Extraction</div>
      <div>Queue {snapshot.extraction.scheduler.queueDepth}, in flight {snapshot.extraction.scheduler.inFlight ? "yes" : "no"}</div>
      <div>Last read boundary {snapshot.extraction.lastReadBoundary}</div>
      {snapshot.extraction.scheduler.lastError && <div className="text-red-300">{snapshot.extraction.scheduler.lastError}</div>}
      {snapshot.extraction.audits[0] && <div>Last scope: {snapshot.extraction.audits[snapshot.extraction.audits.length - 1]?.scope.join(", ") || "none"}</div>}
      <div>Audits recorded {snapshot.extraction.audits.length}</div>
    </div>
    <ReconciliationPanel snapshot={snapshot} />
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

const FlagControl = ({ manager }: { manager: RuntimeManager }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  const submit = async () => {
    await manager.flagMoment(note);
    setNote("");
    setOpen(false);
    window.toastr?.info?.("Moment flagged in the session journal.", "Story Orchestrator");
  };

  if (!open) return <button id="so-flag-moment" className="menu_button opacity-60" title="Flag this moment — it lands in the session journal for review" aria-label="Flag this moment" onClick={() => setOpen(true)}>⚑</button>;
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        id="so-flag-note"
        className="text_pole flex-1"
        autoFocus
        placeholder="What happened here? (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void submit(); if (event.key === "Escape") setOpen(false); }}
      />
      <button id="so-flag-submit" className="menu_button" onClick={() => void submit()}>Flag</button>
      <button className="menu_button opacity-60" aria-label="Cancel flag" onClick={() => { setNote(""); setOpen(false); }}>✕</button>
    </div>
  );
};

// Restart is the player's one destructive control (it asks first); "Edit story" is the author's
// way into Studio from the chat they are playing — that is the chat the save can hot-swap into.
const StoryControls = ({ snapshot, manager, onEditStory }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onEditStory?: () => void }) => (
  <div className="flex flex-wrap items-center gap-2 border-t border-solid border-white/10 pt-2">
    {snapshot.ui.authorView && onEditStory && (
      <button id="so-edit-story" className="menu_button" title="Open this story in the Checkpoint Studio. Saving there offers to update this chat." onClick={onEditStory}>Edit story</button>
    )}
    <button id="so-restart-story-drawer" className="menu_button opacity-80" title="Start this story over in this chat. Messages stay; progress and story memory are cleared." onClick={() => void manager.restartStory()}>Restart story</button>
    {snapshot.ui.authorView && snapshot.storyIdentity.drifted && (
      <button id="so-update-story" className="menu_button" title="Take the newer version from the library into this chat." onClick={() => void manager.applyStoryUpdate()}>Update to v{snapshot.storyIdentity.libraryVersion}</button>
    )}
  </div>
);

export const DrawerTabs = ({ snapshot, manager, driver, onOpenSettings, onEditStory }: DrawerTabsProps) => {
  const [active, setActive] = useState<DrawerTabId>("overview");
  const authorView = snapshot.ui.authorView;
  const tabs = TABS.filter((tab) => authorView || !tab.authorOnly);
  const activeTab = tabs.some((tab) => tab.id === active) ? active : "overview";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Story Orchestrator tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`menu_button ${activeTab === tab.id ? "" : "opacity-60"}`}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <FlagControl manager={manager} />
      </div>
      <div role="tabpanel">
        {activeTab === "overview" && <OverviewTab snapshot={snapshot} authorView={authorView} onOpenSettings={onOpenSettings} />}
        {activeTab === "blackboard" && <BlackboardTab snapshot={snapshot} />}
        {activeTab === "memory" && <MemoryTab snapshot={snapshot} manager={manager} authorView={authorView} />}
        {activeTab === "scheduler" && <SchedulerTab snapshot={snapshot} />}
        {activeTab === "payload" && <PayloadTab snapshot={snapshot} />}
      </div>
      {activeTab === "overview" && <StoryControls snapshot={snapshot} manager={manager} onEditStory={onEditStory} />}
      {/* The driver steers the story — Suggest/Probe/Advance/Nudge are author tools by D1, never
          part of the player surface, whatever the copilot setting says. */}
      {snapshot.copilot.enabled && authorView && (
        <div className="border-t border-solid border-white/10 pt-2">
          <DriverPanel context={driver.context} checkpoints={snapshot.checkpoints} activeNudge={driver.activeNudge} controller={driver.controller} authorView={authorView} />
        </div>
      )}
    </div>
  );
};

export default DrawerTabs;

import { useEffect, useState } from "react";
import { describeProvenance, originLabel, MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "@memory/index";
import type { EffectTarget, RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import { nextRepairStep } from "@runtime/repair";
import { lorebookFileId } from "@utils/string";
import DriverPanel, { type DriverController } from "./DriverPanel";
import ConflictQueue from "./ConflictQueue";
import PlayerOverview from "./PlayerOverview";
import StagecraftPanel from "./StagecraftPanel";
import ScenePanel from "./ScenePanel";
import ModelCallsPanel from "./ModelCallsPanel";
import { NextTurnPanel, type NextTurnOwnerTab } from "./NextTurnPanel";
import { FATE_LABELS } from "./memoryFate";
import { MessageCitation, MessageJumpProvider } from "./MessageCitation";


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
  onFixWithWizard?: () => void;
  /** V19: the settings panel's Repair step, revealed. */
  onOpenRepair?: () => void;
  onNewStory?: () => void;
  /** v2.4 plan 02 §5 (author view, E1): cut a branch at the oldest point this run can still restore. */
  onBranchFromOldest?: (messageId: number) => void;
  /** v2.4 plan 08 T19d (D12, author view): a cited "message N" scrolls the chat there through /chat-jump. */
  onJumpToMessage?: (messageId: number) => void;
}

const extractionReady = (snapshot: RuntimeSnapshot): boolean => snapshot.extraction.settings.enabled && Boolean(snapshot.extraction.settings.profileId);

const StatusDot = ({ ok }: { ok: boolean }) => <span className={`status-indicator status-${ok ? "success" : "error"}`} />;

// Diagnose-only dots were the U6 half of this panel: the wizard turns them into a next step it can
// actually take — create the missing cards, lorebook and group (plan 06). Personas stay diagnostic.
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
        <button id="so-fix-with-wizard" className="menu_button self-start" title="Open the wizard on the provisioning step, pre-filled with what this story is missing." onClick={onFixWithWizard}>Fix with wizard</button>
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
// v2.4 plan 02 §5 (seed D out of horizon, X25): an edit past the retained history cannot be rewound here,
// but a branch cut at the floor starts exactly there, and its Continue from here restores it. Author view
// only until a player session has looked at it (rule 7).
const HistoryFloor = ({ snapshot, onBranchFromOldest }: { snapshot: RuntimeSnapshot; onBranchFromOldest?: (messageId: number) => void }) => {
  const oldest = snapshot.rollbackUnavailable?.oldest;
  if (!oldest || !onBranchFromOldest) return null;
  return (
    <div id="so-history-floor" className="text-xs opacity-80">
      <div className="font-medium opacity-100">History floor</div>
      <div>Oldest restorable point: boundary {oldest.boundary}, message {oldest.messageId}</div>
      <button id="so-branch-from-oldest" type="button" className="menu_button" disabled={oldest.messageId < 0} onClick={() => onBranchFromOldest(oldest.messageId)}>Branch from the oldest restorable point</button>
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

const OverviewTab = ({ snapshot, authorView, onOpenSettings, onFixWithWizard, onReread, onRestart, onRetry, onBranchFromOldest }: { snapshot: RuntimeSnapshot; authorView: boolean; onOpenSettings?: () => void; onFixWithWizard?: () => void; onReread?: () => void; onRestart?: () => void; onRetry?: () => void; onBranchFromOldest?: (messageId: number) => void }) => (
  <div className="flex flex-col gap-3">
    <PlayerOverview snapshot={snapshot} onOpenSettings={onOpenSettings} onReread={onReread} onRestart={onRestart} onRetry={onRetry} />
    {authorView && <AuthorOverview snapshot={snapshot} onFixWithWizard={onFixWithWizard} onBranchFromOldest={onBranchFromOldest} />}
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
              <td title={snapshot.blackboardMeta[key]?.evidence ?? ""}>{snapshot.blackboardMeta[key]?.source}{snapshot.blackboardMeta[key]?.reader ? ` · ${snapshot.blackboardMeta[key]?.reader}${snapshot.blackboardMeta[key]?.confidence !== undefined ? ` ${Math.round((snapshot.blackboardMeta[key]?.confidence ?? 0) * 100)}%` : ""}` : ""}{snapshot.blackboardMeta[key]?.latched ? " (locked)" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

// v2.3 plan 05: the rule lives in @memory/provenance, so this panel and the conflict queue cannot
// drift apart on it. The title carries the long form, and its message when it has one.
const originTitle = (entry: MemoryEntry): string => describeProvenance(entry);

// v2.3 plan 09: past this many rows a list stops being readable and starts being scrolled. Below it
// the controls would be chrome, so they appear with the volume that needs them.
const MEMORY_SEARCH_FROM = 50;

const MemoryTab = ({ snapshot, manager, authorView, focusFact }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; authorView: boolean; focusFact?: string | null }) => {
  const [characterFilter, setCharacterFilter] = useState("");
  const [query, setQuery] = useState("");
  const [hiddenTiers, setHiddenTiers] = useState<MemoryTier[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const characterIds = Array.from(new Set(snapshot.memory.entries.map((entry) => entry.characterId).filter((id): id is string => Boolean(id)))).sort();
  const filtered = characterFilter ? snapshot.memory.entries.filter((entry) => entry.characterId === characterFilter) : snapshot.memory.entries;
  // Superseded and folded entries are bookkeeping: the player curates established facts only.
  const visible = authorView ? filtered : filtered.filter((entry) => !entry.supersededBy && !entry.foldedInto && entry.provenance?.validity !== "conflicted");
  const searchable = snapshot.memory.entries.length > MEMORY_SEARCH_FROM;
  const needle = query.trim().toLowerCase();
  const shown = visible
    .filter((entry) => !hiddenTiers.includes(entry.tier))
    .filter((entry) => !needle || entry.text.toLowerCase().includes(needle) || (entry.characterId ?? "").toLowerCase().includes(needle));
  const toggleTier = (tier: MemoryTier) => setHiddenTiers((current) => (current.includes(tier) ? current.filter((candidate) => candidate !== tier) : [...current, tier]));
  const lastAudit = snapshot.extraction.audits[snapshot.extraction.audits.length - 1];

  // v2.3 plan 05: the warden's card cites the fact a reply broke, so the author can be taken to it.
  // The highlight is transient on purpose — it says "this one", not "this one is special".
  useEffect(() => {
    if (!focusFact || focusFact.startsWith("bound:")) return;
    const row = document.querySelector(`#drawer-manager [data-so="memory-row"][data-id="${focusFact}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("so-revealed");
    const timer = window.setTimeout(() => row.classList.remove("so-revealed"), 2000);
    return () => { window.clearTimeout(timer); row.classList.remove("so-revealed"); };
  }, [focusFact]);

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
      {(snapshot.memory.pinnedOverflow ?? 0) > 0 && (
        <div id="so-pinned-overflow" className="text-amber-300">
          {snapshot.memory.pinnedOverflow} pinned {snapshot.memory.pinnedOverflow === 1 ? "entry" : "entries"} did not fit this tier's budget — unpin or trim them, or raise the budget.
        </div>
      )}
      {authorView && <ConflictQueue snapshot={snapshot} manager={manager} />}
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
        <button className="menu_button" disabled={snapshot.memory.backfill?.running} onClick={() => void manager.memorizeChat()}>{snapshot.memory.backfill?.running && snapshot.memory.backfill.preparing ? "Preparing…" : "Memorize chat"}</button>
        {snapshot.memory.backfill?.running && <button id="so-memorize-stop" className="menu_button" onClick={() => manager.cancelMemorizeBacklog()}>Stop</button>}
        <span className="opacity-60">Read the whole chat history into memory.</span>
      </div>
      {snapshot.memory.backfill?.running && !snapshot.memory.backfill.preparing && <div>Memorizing: {snapshot.memory.backfill.processed}/{snapshot.memory.backfill.total}</div>}
      {snapshot.memory.backfill?.stoppedNote && <div id="so-memorize-note" className="opacity-80">{snapshot.memory.backfill.stoppedNote}</div>}
      {snapshot.memory.backfill?.lastError && <div id="so-memorize-error" className="text-red-300">{snapshot.memory.backfill.lastError}</div>}
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
      {searchable && (
        <div id="so-memory-filter" className="flex flex-col gap-1 mt-1 border-t border-solid border-white/10 pt-1">
          <label className="flex items-center gap-2">
            <span>Find</span>
            <input id="so-memory-search" className="text_pole" type="search" value={query} placeholder="text or character" onChange={(event) => setQuery(event.target.value)} />
            {query && <button className="menu_button" data-so="memory-search-clear" onClick={() => setQuery("")}>Clear</button>}
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {MEMORY_TIERS.map((tier) => (
              <button key={tier} data-so="memory-tier-filter" data-tier={tier} aria-pressed={!hiddenTiers.includes(tier)} className={`st-pill px-1 text-[10px] ${hiddenTiers.includes(tier) ? "opacity-50" : ""}`} onClick={() => toggleTier(tier)}>{MEMORY_TIER_LABELS[tier]}</button>
            ))}
            <span id="so-memory-count" className="opacity-60">{`Showing ${shown.length} of ${visible.length}`}</span>
          </div>
        </div>
      )}
      {MEMORY_TIERS.map((tier) => {
        const entries = shown.filter((entry) => entry.tier === tier);
        if (!entries.length) return null;
        return (
          <div key={tier} className="border-t border-solid border-white/10 mt-1 pt-1">
            <div className="opacity-100">{MEMORY_TIER_LABELS[tier]} ({entries.length})</div>
            {entries.map((entry) => (
              <div key={entry.id} data-so="memory-row" data-id={entry.id} className="mt-1">
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
                      {entry.provenance?.override && <span data-so="kept-by-you" title={describeProvenance(entry)}>kept by you</span>}
                      {entry.provenance && entry.provenance.validity !== "live" && <span data-so="quarantine-badge" className="text-amber-300" title={describeProvenance(entry)}>{entry.provenance.validity === "source-removed" ? "source removed" : entry.provenance.validity}</span>}
                      {authorView && entry.locked && <span data-so="locked" title="No extraction or consolidation may retire this row">🔒 locked</span>}
                      {authorView && <span>importance {entry.importance} · {entry.expiration}</span>}
                      {authorView && entry.supersededBy && <span title={`superseded by ${entry.supersededBy}`}>⤳ superseded</span>}
                      {authorView && entry.foldedInto && <span title={`folded into ${entry.foldedInto}`}>🗜 folded</span>}
                      {authorView && entry.contradicted && !entry.supersededBy && <span>⚠ contradicted</span>}
                      {authorView && entry.recallCount > 0 && <span>recall {entry.recallCount}</span>}
                      {authorView && <span data-so="memory-origin" title={originTitle(entry)}>{originLabel(entry.provenance)}</span>}
                      {authorView && <MessageCitation messageId={entry.provenance?.messageId} />}
                      {authorView && snapshot.memoryInjection?.fates[entry.id] && <span data-so="memory-fate" data-fate={snapshot.memoryInjection.fates[entry.id]}>{FATE_LABELS[snapshot.memoryInjection.fates[entry.id]]}</span>}
                      <button className="menu_button" onClick={() => void manager.setMemoryPinned(entry.id, !entry.pinned)}>{entry.pinned ? "Unpin" : "Pin"}</button>
                      {authorView && <button className="menu_button" data-so="memory-lock" title="Lock: freeze this as the story's truth. No extraction or consolidation may retire it, and a contradicting claim goes to the queue you decide." onClick={() => void manager.memoryActions.setMemoryLocked(entry.id, !entry.locked)}>{entry.locked ? "Unlock" : "Lock"}</button>}
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
          <NotStoredPanel snapshot={snapshot} manager={manager} />
          <ArcCanonPanel snapshot={snapshot} manager={manager} />
          <EpistemicPanel snapshot={snapshot} manager={manager} />
          <LedgerPanel snapshot={snapshot} manager={manager} />
          <EffectLedgerPanel snapshot={snapshot} />
        </>
      )}
    </div>
  );
};

const EFFECT_STATUS_COPY: Record<string, string> = {
  pending: "was being written when this chat last saved",
  applied: "applied",
  failed: "could not be applied",
  reverted: "put back",
  "revert-failed": "could not be put back — try again",
  "externally-changed": "someone else changed it after this story did, so it was left alone",
};

const describeEffectTarget = (target: EffectTarget): string => {
  if (target.kind === "cast") return `cast: ${target.member}`;
  if (target.kind === "wi") return `lore: ${target.book} · ${target.entry}`;
  if (target.kind === "an") return "author's note";
  if (target.kind === "background") return "background";
  return `preset: ${target.name} (${target.api})`;
};

// v2.3 plan 06. What this chat changed in state it SHARES with other chats — a group's cast, a
// lorebook, the Author's Note — and whether it could be put back. Author-only: it is the machinery a
// player never needs to know about, and it names entries and upcoming staging.
const EffectLedgerPanel = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const rows = [...(snapshot.effects?.ledger ?? [])].reverse();
  if (!rows.length) return null;
  return (
    <details data-so="effect-ledger" className="border-t border-solid border-white/10 mt-1 pt-1">
      <summary className="opacity-100 cursor-pointer">Host changes this chat made ({rows.length})</summary>
      {rows.map((row) => (
        <div key={row.id} data-so="effect-row" data-status={row.status} className="opacity-80 mt-1">
          <div>{describeEffectTarget(row.target)} <span className="opacity-60">· {row.effect} · {EFFECT_STATUS_COPY[row.status] ?? row.status}</span></div>
          {row.reason && <div className="text-amber-300">{row.reason}</div>}
          <div className="opacity-50">boundary {row.boundary} · <MessageCitation messageId={row.messageId} /></div>
        </div>
      ))}
    </details>
  );
};

// v2.2 plan 02: lines the judgment model found no support for, kept here instead of in memory. The
// author can store one anyway; it goes in at its judged confidence.
const NotStoredPanel = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const drops = snapshot.memory.verifyDrops ?? [];
  if (!drops.length) return null;
  return (
    <details data-so="memory-not-stored" className="border-t border-solid border-white/10 mt-1 pt-1">
      <summary className="opacity-100 cursor-pointer">Not stored — no support in the chat ({drops.length})</summary>
      {drops.map((drop) => (
        <div key={drop.entry.id} className="flex gap-2 opacity-80 flex-wrap mt-1">
          <span title={drop.entry.evidence}>{drop.entry.text}</span>
          <span className="opacity-60">support {drop.p.toFixed(2)}{drop.model ? ` · ${drop.model}` : ""}</span>
          <button className="menu_button" data-so="memory-store-anyway" onClick={() => void manager.storeDroppedMemory(drop.entry.id)}>Store anyway</button>
        </div>
      ))}
    </details>
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
  // Rows are version lists (M3): the row shows the newest version, so Remove addresses that one.
  const idFor = (entity: string, field: string) => stored.filter((entry) => entry.entity.toLowerCase() === entity.toLowerCase() && entry.field.toLowerCase() === field.toLowerCase()).at(-1)?.id;
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
            <div><MessageCitation messageId={decision.messageId} prefix="msg" /> · {decision.checkpointId} · {decision.latencyMs} ms</div>
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

const SchedulerTab = ({ snapshot, manager, onOpenFact }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenFact?: (id: string) => void }) => (
  <div className="flex flex-col gap-3">
    <StagecraftPanel snapshot={snapshot} manager={manager} onOpenFact={onOpenFact} />
    <TalkDecisionsPanel snapshot={snapshot} />
    <ModelCallsPanel calls={snapshot.modelCalls ?? []} />
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Extraction</div>
      <div>Queue {snapshot.extraction.scheduler.queueDepth}, in flight {snapshot.extraction.scheduler.inFlight ? "yes" : "no"}</div>
      <div>Last read boundary {snapshot.extraction.lastReadBoundary}</div>
      {snapshot.extraction.scheduler.lastError && <div className="text-red-300">{snapshot.extraction.scheduler.lastError}</div>}
      {snapshot.extraction.audits[0] && <div>Last scope: {snapshot.extraction.audits[snapshot.extraction.audits.length - 1]?.scope.join(", ") || "none"}</div>}
      <div>Audits recorded {snapshot.extraction.audits.length}</div>
      {(snapshot.extraction.judgedReads ?? []).length > 0 && (
        <div data-so="judged-reads" className="mt-1">
          <div className="opacity-100">Judged reads</div>
          {[...(snapshot.extraction.judgedReads ?? [])].reverse().slice(0, 5).map((read) => (
            <div key={`${read.at}-${read.kind}`}>
              judge:{read.kind} · boundary {read.boundary} · {read.deltas.length ? read.deltas.map((delta) => `${delta.q}=${String(delta.v)} (${Math.round(delta.confidence * 100)}%)`).join(", ") : read.note ?? "no change"}{read.fallback ? ` · fell back (${read.fallback})` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
    <ReconciliationPanel snapshot={snapshot} />
    {snapshot.agencyRecovery && (
      <div data-so="agency-recovery" className="text-xs opacity-80 border-t border-solid border-white/10 pt-1">
        <div className="font-medium opacity-100">Refused route</div>
        <div>The player&apos;s last {snapshot.agencyRecovery.turns} turns were read, and nothing in them moved an exit of {snapshot.agencyRecovery.checkpointName}.</div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {snapshot.agencyRecovery.alternate && (
            <button className="menu_button text-xs" data-so="agency-take-alternate" onClick={() => void manager.activateCheckpoint(snapshot.agencyRecovery!.alternate!)}>Take {snapshot.agencyRecovery.alternateName}</button>
          )}
          {snapshot.agencyRecovery.canGenerate && (
            <button className="menu_button text-xs" data-so="agency-generate-road" onClick={() => void manager.runExpansionNow(undefined, true)}>Generate the road ahead</button>
          )}
        </div>
      </div>
    )}
    <div className="text-xs opacity-80">
      <div className="font-medium opacity-100">Expansion</div>
      <div>Queue {snapshot.expansion.scheduler.queueDepth}, in flight {snapshot.expansion.scheduler.inFlight ? "yes" : "no"}</div>
      {snapshot.expansion.scheduler.lastError && <div className="text-red-300">{snapshot.expansion.scheduler.lastError}</div>}
      {Object.values(snapshot.expansion.entries).map((entry) => (
        <div key={entry.key} className="border-t border-solid border-white/10 mt-1 pt-1">
          <div>{entry.stubId} → {entry.targetAnchorId}: {entry.status}{entry.needsReview ? " review" : ""}{entry.origin === "lookahead" ? ` · prepared ahead (${Math.round((entry.headingP ?? 0) * 100)}%)` : ""}</div>
          {(entry.verdicts.at(-1)?.judge || entry.variants) && (
            <div data-so="expansion-judge" className="opacity-80">
              {entry.verdicts.at(-1)?.judge ? `judge: contradicts ${Math.round(entry.verdicts.at(-1)!.judge!.contradicts * 100)}% · advances ${Math.round(entry.verdicts.at(-1)!.judge!.advances * 100)}% · new character ${Math.round(entry.verdicts.at(-1)!.judge!.newCharacter * 100)}%` : ""}
              {entry.variants ? ` · ${entry.variants.generated} written, ${entry.variants.survivors} passed code checks, picked #${(entry.variants.picked ?? -1) + 1} by ${entry.variants.picker}${entry.variants.pickFallback ? ` (${entry.variants.pickFallback} fell back)` : ""}` : ""}
            </div>
          )}
          <div>{entry.beats.length} beats{entry.lastError ? ` — ${entry.lastError}` : ""}</div>
          {(entry.status === "stale" || entry.status === "failed") && (
            <button data-so="expansion-regenerate" className="menu_button text-xs" onClick={() => { void manager.expansions.regenerate(entry.key); }}>Regenerate</button>
          )}
          {entry.beats.slice(0, 3).map((beat) => <div key={beat.objective}>- {beat.objective}</div>)}
        </div>
      ))}
    </div>
  </div>
);

// v2.2 plan 04, author only: what lore-select forced into the latest scan, with each entry's p.
const LoreForced = ({ record }: { record: RuntimeSnapshot["loreForced"] | undefined }) => {
  if (!record) return null;
  const picks = Object.entries(record.p ?? {}).filter(([key]) => key !== "trigger");
  return (
    <div data-so="lore-forced">
      <div className="font-medium opacity-100">Lore forced this turn</div>
      <div className="opacity-70"><MessageCitation messageId={record.messageId} /> · {String(record.p?.trigger ?? "")} · {record.fallback ? `fell back (${record.fallback})` : `${record.latencyMs} ms`}</div>
      {picks.length === 0 ? <div className="opacity-60">Nothing over the floor; ST's keyword scan ran as usual.</div> : picks.map(([title, p]) => <div key={title}>{title} <span className="opacity-60">{typeof p === "number" ? `${Math.round(p * 100)}%` : p}</span></div>)}
    </div>
  );
};

// v2.4 plan 05 T12, author only: what ST's scans ACTIVATED for the last loud generation, read from
// WORLD_INFO_ACTIVATED rather than inferred from what was enabled or forced. It never predicts: a dry
// run emits nothing, so there is no honest preview of this.
const LoreFired = ({ evidence }: { evidence: RuntimeSnapshot["loreEvidence"] }) => {
  const last = evidence?.last ?? null;
  return (
    <div id="so-lore-fired" data-so="lore-fired">
      <div className="font-medium opacity-100">Lore that fired last turn</div>
      {!last ? (
        <div className="opacity-60">No reply has been generated since this chat opened.</div>
      ) : (
        <>
          <div className="opacity-70">{last.rendered ? "reply rendered" : "no reply"} · {last.scanCount} scan{last.scanCount === 1 ? "" : "s"}{last.nestedScans ? ` (${last.nestedScans} inside a quiet run)` : ""}</div>
          {last.fired.length === 0 ? (
            <div className="opacity-60">Nothing fired. ST reports nothing for a scan that activates nothing.</div>
          ) : last.fired.map((entry) => (
            <div key={`${entry.world}.${entry.uid}`} data-so="lore-fired-row" data-origin={entry.origin} className="flex flex-wrap items-center gap-2">
              <span>{entry.comment || `${entry.world} #${entry.uid}`}</span>
              <span className="opacity-60">{entry.world}{entry.constant ? " · constant" : ""}</span>
              {entry.origin !== "other" && <span className="st-pill px-1 text-[10px]">{entry.origin}</span>}
            </div>
          ))}
          {last.lost.length > 0 && <div data-so="lore-lost" className="text-yellow-300">Forced but never reached the reply: {last.lost.map((entry) => entry.comment || `${entry.world} #${entry.uid}`).join(", ")}</div>}
          {last.constantMissed.length > 0 && <div data-so="lore-constant-missed" className="text-yellow-300">Constant and enabled for this chat, but did not fire: {last.constantMissed.map((entry) => entry.comment).join(", ")}</div>}
        </>
      )}
    </div>
  );
};

// v2.5 plan 01 D (was the v2.4 T13 spike's S5 table), author only and only while scan-time gating is active:
// per gated entry, the story that gates it, the state the last scan loaded (the file's), the state it used,
// and whether it fired.
const flagText = (disabled: boolean | null) => (disabled === null ? "no flag" : disabled ? "off" : "on");

const ScanGateTable = ({ view, evidence }: { view: RuntimeSnapshot["scanGate"]; evidence: RuntimeSnapshot["loreEvidence"] }) => {
  if (!view) return null;
  const fired = evidence?.last?.fired ?? [];
  const firedRow = (lorebook: string, uid: number) => fired.some((entry) => entry.uid === uid && entry.world.trim().toLowerCase() === lorebookFileId(lorebook).toLowerCase());
  return (
    <div id="so-scan-gate" data-so="scan-gate">
      <div className="font-medium opacity-100">Per-chat lorebook gating: {view.owner === "story" ? "this chat's path" : "no story"}</div>
      {view.rows.length === 0 ? (
        <div className="opacity-60">No gated entry was in the last scan.</div>
      ) : view.rows.map((row) => (
        <div key={`${row.lorebook}.${row.uid}`} data-so="scan-gate-row" data-effective={flagText(row.effectiveDisabled)} className="flex flex-wrap items-center gap-2">
          <span>{row.comment}</span>
          <span className="opacity-60">{row.lorebook}{row.gatedBy?.length ? ` · gated by ${row.gatedBy.join(", ")}` : ""} · file {flagText(row.fileDisabled)} · this chat {flagText(row.effectiveDisabled)}{firedRow(row.lorebook, row.uid) ? " · fired" : ""}</span>
        </div>
      ))}
    </div>
  );
};

const SamplerOverlayRow = ({ overlay }: { overlay: RuntimeSnapshot["samplerOverlay"] }) => {
  if (!overlay) return null;
  const values = Object.entries(overlay.values).map(([key, value]) => `${key} ${value}`).join(", ");
  return (
    <div data-so="next-turn-overlay" className="flex flex-col gap-0.5">
      <div className="opacity-100">Sampler overlay “{overlay.name}”: {values}</div>
      <div className="opacity-60">This checkpoint's replies only; the selected preset is untouched. {overlay.applied ? `Applied to ${overlay.applied} request(s).` : "Not applied yet."}</div>
      {overlay.lastSkipped.length > 0 && <div className="text-yellow-300">Not in the last request: {overlay.lastSkipped.join(", ")}</div>}
      {overlay.unknown.length > 0 && <div className="opacity-60">Not sent (not a per-request sampler): {overlay.unknown.join(", ")}</div>}
    </div>
  );
};

const PayloadTab = ({ snapshot, manager, onOpenOwner }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onOpenOwner: (tab: NextTurnOwnerTab) => void }) => {
  const captures = snapshot.payloadCaptures;
  return (
    <div className="text-xs opacity-80 flex flex-col gap-2">
      <LoreForced record={snapshot.loreForced} />
      <LoreFired evidence={snapshot.loreEvidence} />
      <ScanGateTable view={snapshot.scanGate} evidence={snapshot.loreEvidence} />
      <SamplerOverlayRow overlay={snapshot.samplerOverlay} />
      <NextTurnPanel snapshot={snapshot} actions={manager.previewActions} onOpenOwner={onOpenOwner} />
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
// v2.3 plan 09 / V19: the drawer footer carries the same four tasks as the settings panel. Continue is
// the drawer itself; Repair appears only while a step is missing and lands on the panel's own Repair
// row, so there is still one control per task.
const StoryControls = ({ snapshot, manager, onEditStory, onOpenRepair, onNewStory }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; onEditStory?: () => void; onOpenRepair?: () => void; onNewStory?: () => void }) => {
  const repair = nextRepairStep(snapshot);
  return (
  <div id="so-drawer-entry-points" className="flex flex-wrap items-center gap-2 border-t border-solid border-white/10 pt-2">
    {repair && onOpenRepair && (
      <button id="so-drawer-repair" className="menu_button" title={repair.detail} onClick={onOpenRepair}>Repair: {repair.consequence}</button>
    )}
    {onNewStory && (
      <button id="so-drawer-new-story" className="menu_button opacity-80" title="Start a new story with the wizard." onClick={onNewStory}>New story</button>
    )}
    {snapshot.ui.authorView && onEditStory && (
      <button id="so-edit-story" className="menu_button" title="Open this story in the Checkpoint Studio. Saving there offers to update this chat." onClick={onEditStory}>Edit story</button>
    )}
    <button id="so-restart-story-drawer" className="menu_button opacity-80" title="Start this story over in this chat. Messages stay; progress and story memory are cleared." onClick={() => void manager.restartStory()}>Restart story</button>
    {snapshot.ui.authorView && snapshot.storyIdentity.drifted && (
      <button id="so-update-story" className="menu_button" title="Take the newer version from the library into this chat." onClick={() => void manager.applyStoryUpdate()}>Update to v{snapshot.storyIdentity.libraryVersion}</button>
    )}
  </div>
  );
};

export const DrawerTabs = ({ snapshot, manager, driver, onOpenSettings, onEditStory, onFixWithWizard, onOpenRepair, onNewStory, onBranchFromOldest, onJumpToMessage }: DrawerTabsProps) => {
  const [active, setActive] = useState<DrawerTabId>("overview");
  // v2.3 plan 05: a warden card cites the message a fact was read from, so its button has to land on
  // that fact. A `bound:` id is the blackboard's, and the blackboard tab is where it lives; a memory
  // row is focused in the Memory tab instead.
  const [focusFact, setFocusFact] = useState<string | null>(null);
  const openFact = (id: string) => {
    setFocusFact(id);
    setActive(id.startsWith("bound:") ? "blackboard" : "memory");
  };
  const authorView = snapshot.ui.authorView;
  const tabs = TABS.filter((tab) => authorView || !tab.authorOnly);
  const activeTab = tabs.some((tab) => tab.id === active) ? active : "overview";
  return (
    <MessageJumpProvider value={{ enabled: authorView, index: snapshot.chatJump ?? null, onJump: onJumpToMessage ?? null }}>
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
        {activeTab === "overview" && <OverviewTab snapshot={snapshot} authorView={authorView} onOpenSettings={onOpenSettings} onFixWithWizard={onFixWithWizard} onReread={() => void manager.runExtractionNow(undefined, "recovery")} onRestart={() => void manager.restartStory()} onRetry={() => void manager.retryExtraction()} onBranchFromOldest={onBranchFromOldest} />}
        {activeTab === "blackboard" && <BlackboardTab snapshot={snapshot} />}
        {activeTab === "memory" && <MemoryTab snapshot={snapshot} manager={manager} authorView={authorView} focusFact={focusFact} />}
        {activeTab === "scheduler" && <SchedulerTab snapshot={snapshot} manager={manager} onOpenFact={openFact} />}
        {activeTab === "payload" && <PayloadTab snapshot={snapshot} manager={manager} onOpenOwner={(tab) => (tab === "config" ? onOpenSettings?.() : setActive(tab))} />}
      </div>
      {activeTab === "overview" && <StoryControls snapshot={snapshot} manager={manager} onEditStory={onEditStory} onOpenRepair={onOpenRepair} onNewStory={onNewStory} />}
      {/* The driver steers the story — Suggest/Probe/Advance/Nudge are author tools by D1, never
          part of the player surface, whatever the copilot setting says. */}
      {snapshot.copilot.enabled && authorView && (
        <div className="border-t border-solid border-white/10 pt-2">
          <DriverPanel context={driver.context} checkpoints={snapshot.checkpoints} activeNudge={driver.activeNudge} controller={driver.controller} authorView={authorView} agency={snapshot.agency} />
        </div>
      )}
    </div>
    </MessageJumpProvider>
  );
};

export default DrawerTabs;

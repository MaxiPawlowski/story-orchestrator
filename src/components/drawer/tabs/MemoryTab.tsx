import { useEffect, useState } from "react";
import { describeProvenance, originLabel, MEMORY_TIERS, type MemoryEntry, type MemoryTier } from "@memory/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/index";
import ConflictQueue from "../ConflictQueue";
import { FATE_LABELS } from "../memoryFate";
import { MessageCitation } from "../MessageCitation";
import { ArcCanonPanel, EffectLedgerPanel, EpistemicPanel, LedgerPanel, NotStoredPanel } from "./MemoryPanels";

const MEMORY_TIER_LABELS: Record<MemoryTier, string> = {
  facts: "Facts",
  session_details: "Session details",
  short_term: "Short-term",
  scene_history: "Scene history",
};

// v2.3 plan 05: the rule lives in @memory/provenance, so this panel and the conflict queue cannot
// drift apart on it. The title carries the long form, and its message when it has one.
const originTitle = (entry: MemoryEntry): string => describeProvenance(entry);

// v2.3 plan 09: past this many rows a list stops being readable and starts being scrolled. Below it
// the controls would be chrome, so they appear with the volume that needs them.
const MEMORY_SEARCH_FROM = 50;

const MemoryControls = ({ snapshot, manager, authorView }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; authorView: boolean }) => {
  const lastAudit = snapshot.extraction.audits[snapshot.extraction.audits.length - 1];
  return (
    <>
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
    </>
  );
};

interface MemoryRowProps {
  entry: MemoryEntry;
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  authorView: boolean;
  editing: boolean;
  draftText: string;
  onDraft: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onExclude: () => void;
}

const MemoryRow = ({ entry, snapshot, manager, authorView, editing, draftText, onDraft, onSave, onCancel, onEdit, onExclude }: MemoryRowProps) => (
  <div data-so="memory-row" data-id={entry.id} className="mt-1">
    {editing ? (
      <div className="flex flex-col gap-1">
        <textarea className="text_pole" rows={2} value={draftText} onChange={(event) => onDraft(event.target.value)} />
        <div className="flex gap-2">
          <button className="menu_button" onClick={onSave}>Save</button>
          <button className="menu_button" onClick={onCancel}>Cancel</button>
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
          <button className="menu_button" onClick={onEdit}>Edit</button>
          <button className="menu_button" onClick={onExclude}>Exclude</button>
        </div>
      </>
    )}
  </div>
);

export const MemoryTab = ({ snapshot, manager, authorView, focusFact }: { snapshot: RuntimeSnapshot; manager: RuntimeManager; authorView: boolean; focusFact?: string | null }) => {
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
      <MemoryControls snapshot={snapshot} manager={manager} authorView={authorView} />
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
              <MemoryRow key={entry.id} entry={entry} snapshot={snapshot} manager={manager} authorView={authorView} editing={editingId === entry.id}
                draftText={draftText} onDraft={setDraftText} onSave={() => void saveEdit()} onCancel={() => setEditingId(null)}
                onEdit={() => startEdit(entry.id, entry.text)} onExclude={() => void excludeWithUndo(entry.id)} />
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

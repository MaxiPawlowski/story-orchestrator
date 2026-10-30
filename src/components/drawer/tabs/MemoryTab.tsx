import { useEffect, useState } from "react";
import { Lazy } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import { isEstablished, MEMORY_TIERS, withWithheld, type MemoryEntry, type MemoryTier } from "@memory/index";
import { MEMORY_TIER_LABELS, memorizeProgressText, PLAYER_COPY, pinnedOverflowText } from "@runtime/narrative";
import type { RuntimeSnapshot } from "@runtime/types";
import { memoryEntriesFor, memorySearchable } from "@runtime/surfaceShown";
import type { RuntimeManager } from "@runtime/index";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";

const ConflictQueue = lazyRetry(() => import("../ConflictQueue"));
const AuthorMemoryPanels = lazyRetry(() => import("./MemoryPanels"));
const AuthorMemoryControls = lazyRetry(() => import("./AuthorMemory").then((module) => ({ default: module.AuthorMemoryControls })));
const AuthorMemoryRowExtras = lazyRetry(() => import("./AuthorMemory").then((module) => ({ default: module.AuthorMemoryRowExtras })));


const characterName = (snapshot: RuntimeSnapshot, id: string) => snapshot.castNames?.[id] ?? id;

const MemoryControls = ({ snapshot, manager }: { snapshot: RuntimeSnapshot; manager: RuntimeManager }) => {
  const backfill = snapshot.memory.backfill;
  return (
    <>
      <div className="flex items-center gap-2 mt-1">
        <Button type="button" disabled={backfill?.running} onClick={() => void manager.memorizeChat()}>
          {backfill?.running && backfill.preparing ? "Preparing…" : "Memorize chat"}
        </Button>
        {backfill?.running && <Button type="button" id="so-memorize-stop" onClick={() => manager.cancelMemorizeBacklog()}>Stop</Button>}
        <span className="opacity-70">Read the whole chat history into memory.</span>
      </div>
      {backfill?.running && !backfill.preparing && <div>{memorizeProgressText(backfill.processed, backfill.total)}</div>}
      {backfill?.stoppedNote && <div id="so-memorize-note" className="opacity-80">{backfill.stoppedNote}</div>}
      {backfill?.lastError && <StatusText as="div" tone="error" id="so-memorize-error" role="alert">{PLAYER_COPY.memorizeError}</StatusText>}
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
        <textarea className="text_pole" rows={2} aria-label="Edit this memory" value={draftText} onChange={(event) => onDraft(event.target.value)} />
        <div className="flex gap-2">
          <Button type="button" onClick={onSave}>Save</Button>
          <Button type="button" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    ) : (
      <>
        <div className={entry.supersededBy || (entry.foldedInto && !isEstablished(entry)) ? "opacity-70 line-through" : ""}>
          {entry.text}{entry.pinned ? " 📌" : ""}{entry.characterId ? ` (${characterName(snapshot, entry.characterId)})` : ""}
        </div>
        <div className="flex gap-2 flex-wrap">
          {entry.provenance?.override && <span data-so="kept-by-you">{PLAYER_COPY.keptByYou}</span>}
          {entry.provenance && entry.provenance.validity !== "live" && <StatusText as="span" tone="warn" data-so="quarantine-badge">{PLAYER_COPY.sourceChanged}</StatusText>}
          {authorView && <Lazy fallback={null}><AuthorMemoryRowExtras entry={entry} snapshot={snapshot} manager={manager} /></Lazy>}
          <Button type="button" onClick={() => void manager.setMemoryPinned(entry.id, !entry.pinned)}>{entry.pinned ? "Unpin" : "Pin"}</Button>
          <Button type="button" onClick={onEdit}>Edit</Button>
          <Button type="button" onClick={onExclude}>Exclude</Button>
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
  const [excluded, setExcluded] = useState<{ entry: MemoryEntry | null; state: "excluded" | "refused" | "restored" } | null>(null);

  const entries = memoryEntriesFor(snapshot, authorView);
  const characterIds = Array.from(new Set(entries.map((entry) => entry.characterId).filter((id): id is string => Boolean(id)))).sort();
  const filtered = characterFilter ? entries.filter((entry) => entry.characterId === characterFilter) : entries;
  // Superseded and folded entries are bookkeeping: the player curates established facts only.
  const visible = authorView ? filtered : filtered.filter((entry) => !entry.supersededBy && (!entry.foldedInto || isEstablished(entry)) && entry.provenance?.validity !== "conflicted");
  const searchable = memorySearchable(snapshot, authorView);
  const needle = query.trim().toLowerCase();
  const shown = visible
    .filter((entry) => !hiddenTiers.includes(entry.tier))
    .filter((entry) => !needle || entry.text.toLowerCase().includes(needle) || (entry.characterId ? characterName(snapshot, entry.characterId) : "").toLowerCase().includes(needle));
  const toggleTier = (tier: MemoryTier) => setHiddenTiers((current) => (current.includes(tier) ? current.filter((candidate) => candidate !== tier) : [...current, tier]));

  // The warden's card cites the fact a reply broke, so the author can be taken to it.
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
    const entry = snapshot.memory.entries.find((candidate) => candidate.id === id) ?? null;
    setExcluded(null);
    const done = await manager.excludeMemoryEntry(id);
    setExcluded({ entry, state: done ? "excluded" : "refused" });
  };
  const undoExclude = async () => {
    if (!excluded?.entry) return;
    await manager.restoreMemoryEntry(excluded.entry);
    setExcluded({ entry: null, state: "restored" });
  };
  const saveEdit = async () => {
    if (!editingId) return;
    const original = snapshot.memory.entries.find((entry) => entry.id === editingId)?.text;
    const shownText = entries.find((entry) => entry.id === editingId)?.text;
    await manager.editMemoryEntry(editingId, original !== undefined && shownText !== undefined ? withWithheld(original, shownText, draftText) : draftText);
    setEditingId(null);
  };

  return (
    <div data-so="memory-tab" className="so-memory-tab">
      {excluded && (
        <div id="so-memory-excluded" data-so="memory-excluded" data-state={excluded.state} role="status" className="flex flex-wrap items-center gap-2 mt-1">
          <StatusText as="span" tone={excluded.state === "refused" ? "warn" : "neutral"}>
            {excluded.state === "excluded" ? PLAYER_COPY.memoryExcluded : excluded.state === "restored" ? PLAYER_COPY.memoryRestored : PLAYER_COPY.memoryExcludeRefused}
          </StatusText>
          {excluded.state === "excluded" && excluded.entry && (
            <Button type="button" id="so-memory-undo" onClick={() => void undoExclude()}>{PLAYER_COPY.memoryUndo}</Button>
          )}
        </div>
      )}
      {(snapshot.memory.pinnedOverflow ?? 0) > 0 && (
        <StatusText as="div" tone="warn" id="so-pinned-overflow">{pinnedOverflowText(snapshot.memory.pinnedOverflow ?? 0)}</StatusText>
      )}
      {authorView && <Lazy fallback={null}><ConflictQueue snapshot={snapshot} manager={manager} /></Lazy>}
      {authorView && <Lazy fallback={null}><AuthorMemoryControls snapshot={snapshot} manager={manager} /></Lazy>}
      <MemoryControls snapshot={snapshot} manager={manager} />
      {characterIds.length > 0 && (
        <label className="flex items-center gap-2 mt-1">
          <span>Character</span>
          <select value={characterFilter} onChange={(event) => setCharacterFilter(event.target.value)}>
            <option value="">All</option>
            {characterIds.map((id) => <option key={id} value={id}>{characterName(snapshot, id)}</option>)}
          </select>
        </label>
      )}
      {searchable && (
        <div id="so-memory-filter" className="flex flex-col gap-1 mt-1 border-t border-solid border-[var(--so-line)] pt-1">
          <label className="flex items-center gap-2">
            <span>Find</span>
            <input id="so-memory-search" className="text_pole" type="search" value={query} placeholder="text or character" onChange={(event) => setQuery(event.target.value)} />
            {query && <Button data-so="memory-search-clear" onClick={() => setQuery("")}>Clear</Button>}
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {MEMORY_TIERS.map((tier) => (
              <button
                type="button"
                key={tier}
                data-so="memory-tier-filter"
                data-tier={tier}
                aria-pressed={!hiddenTiers.includes(tier)}
                className={`st-pill px-1 text-[10px] ${hiddenTiers.includes(tier) ? "opacity-70" : ""}`}
                onClick={() => toggleTier(tier)}
              >{MEMORY_TIER_LABELS[tier]}</button>
            ))}
            <span id="so-memory-count" className="opacity-70">{`Showing ${shown.length} of ${visible.length}`}</span>
          </div>
        </div>
      )}
      {MEMORY_TIERS.map((tier) => {
        const rows = shown.filter((entry) => entry.tier === tier);
        if (!rows.length) return null;
        return (
          <div key={tier} className="border-t border-solid border-[var(--so-line)] mt-1 pt-1">
            <div className="opacity-100">{MEMORY_TIER_LABELS[tier]} ({rows.length})</div>
            {rows.map((entry) => (
              <MemoryRow key={entry.id} entry={entry} snapshot={snapshot} manager={manager} authorView={authorView} editing={editingId === entry.id}
                draftText={draftText} onDraft={setDraftText} onSave={() => void saveEdit()} onCancel={() => setEditingId(null)}
                onEdit={() => startEdit(entry.id, entry.text)} onExclude={() => void excludeWithUndo(entry.id)} />
            ))}
          </div>
        );
      })}
      {authorView && <Lazy fallback={null}><AuthorMemoryPanels snapshot={snapshot} manager={manager} /></Lazy>}
    </div>
  );
};

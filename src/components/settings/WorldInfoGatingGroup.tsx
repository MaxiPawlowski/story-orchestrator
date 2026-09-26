import type { WiGatingStatus } from "@runtime/worldInfoMode";

export interface WorldInfoGatingGroupProps {
  status: WiGatingStatus | null;
  /** Entry names are checkpoint names, so they are spoilers: counts only unless the author view is on. */
  authorView: boolean;
  onChoose: (mode: "file" | "scan") => void;
  onRenormalize: () => void;
  scanMemory: boolean;
  onScanMemory: (on: boolean) => void;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const entryList = (entries: Array<{ lorebook: string; comment: string }>, named: boolean) => (named
  ? entries.map((entry) => `${entry.lorebook}: ${entry.comment}`).join("; ")
  : plural(entries.length, "entry", "entries"));

// C. Install-wide. Choosing per chat opens the confirm that normalises the story lorebooks
// (nothing changes before it); choosing file writes asks nothing. Drift is the Repair row's target, and the
// re-normalise button is its one action.
const SCAN_MEMORY_COPY = "Memory text can trigger lore: established facts, scene history and checkpoint guidance join every World Info scan, so a lorebook entry " +
  "whose keys they mention can activate. What characters privately know and the state ledger never join it.";

export function WorldInfoGatingGroup({ status, authorView, onChoose, onRenormalize, scanMemory, onScanMemory }: WorldInfoGatingGroupProps) {
  const mode = status?.mode ?? "file";
  const busy = status?.busy ?? false;
  const unavailable = mode === "scan" && status?.capability && status.capability.state !== "present" ? status.capability : null;
  const fixable = [...(status?.drift ?? []), ...(status?.missingKey ?? [])];
  return (
    <div id="so-wi-gating" data-so="wi-gating" className="flex flex-col gap-1 text-sm">
      <label className="flex flex-col gap-1">
        <span>Lorebook gating</span>
        <select id="so-wi-gating-mode" value={mode} disabled={busy} onChange={(event) => onChoose(event.target.value === "scan" ? "scan" : "file")}>
          <option value="file">File writes</option>
          <option value="scan">Per chat (scan)</option>
        </select>
      </label>
      <div className="text-xs opacity-70">
        {mode === "scan"
          ? "Story lorebook entries rest off in their files; each chat sees its own story's entries switched on."
          : "Story Orchestrator switches story lorebook entries on and off in their files as a chat moves."}
      </div>
      {mode === "scan" && status && (
        <div data-so="wi-ledger" className="text-xs opacity-70">
          {status.active ? "Active" : busy ? "Preparing" : "Not active"} · {plural(status.ledger.entries, "entry rests", "entries rest")} off in {plural(status.ledger.books, "lorebook", "lorebooks")}
          {status.missing.length ? ` · ${plural(status.missing.length, "entry", "entries")} no longer in its lorebook` : ""}
          {status.unreadable.length ? ` · could not read ${status.unreadable.join(", ")}` : ""}
        </div>
      )}
      {authorView && (
        <label data-so="wi-scan-memory" className="flex items-start gap-2 text-xs">
          <input id="so-wi-scan-memory" type="checkbox" checked={scanMemory} onChange={(event) => onScanMemory(event.target.checked)} />
          <span>{SCAN_MEMORY_COPY}</span>
        </label>
      )}
      {unavailable && (
        <div data-so="wi-unavailable" className="text-xs text-yellow-300">Per-chat gating is unavailable on this SillyTavern ({unavailable.detail}); lorebooks are gated by file writes.</div>
      )}
      {mode === "scan" && fixable.length > 0 && (
        <div data-so="wi-drift" className="flex flex-col gap-1 text-xs text-yellow-300">
          {status?.drift.length ? <span>Switched on outside the story, so chats without it see {status.drift.length === 1 ? "it" : "them"}: {entryList(status.drift, authorView)}</span> : null}
          {status?.missingKey.length ? <span>Cannot be switched off per chat: {entryList(status.missingKey, authorView)}</span> : null}
          <button id="so-wi-renormalize" className="menu_button self-start" disabled={busy} onClick={onRenormalize}>Switch {fixable.length === 1 ? "it" : "them"} off again</button>
        </div>
      )}
    </div>
  );
}

export default WorldInfoGatingGroup;

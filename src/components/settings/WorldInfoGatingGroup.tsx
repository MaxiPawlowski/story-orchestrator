import type { WiGatingStatus } from "@runtime/worldInfoMode";
import { settingHelp } from "@features/settingsCopy";
import { Advanced, CheckRow, FieldLabel } from "./Field";

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

type GatedEntry = { lorebook: string; comment: string };

const entryCount = (entries: GatedEntry[]) => plural(entries.length, "entry", "entries");

const WiGatingAuthorDetail = ({ status, unavailable }: { status: WiGatingStatus | null; unavailable: { detail?: string } | null }) => {
  const named = (entries: GatedEntry[]) => entries.map((entry) => `${entry.lorebook}: ${entry.comment}`).join("; ");
  return (
    <div data-so="wi-author-detail" className="flex flex-col gap-1 text-xs opacity-80">
      {unavailable?.detail && <span data-so="wi-unavailable-detail">{unavailable.detail}</span>}
      {status?.drift.length ? <span data-so="wi-drift-entries">Switched on outside the story: {named(status.drift)}</span> : null}
      {status?.missingKey.length ? <span data-so="wi-missing-key-entries">Cannot be switched off per chat: {named(status.missingKey)}</span> : null}
    </div>
  );
};

// C. Install-wide. Choosing per chat opens the confirm that normalises the story lorebooks
// (nothing changes before it); choosing file writes asks nothing. Drift is the Repair row's target, and the
// re-normalise button is its one action.
export function WorldInfoGatingGroup({ status, authorView, onChoose, onRenormalize, scanMemory, onScanMemory }: WorldInfoGatingGroupProps) {
  const mode = status?.mode ?? "file";
  const busy = status?.busy ?? false;
  const unavailable = mode === "scan" && status?.capability && status.capability.state !== "present" ? status.capability : null;
  const fixable = [...(status?.drift ?? []), ...(status?.missingKey ?? [])];
  return (
    <div id="so-wi-gating" data-so="wi-gating" className="flex flex-col gap-1 text-sm">
      <Advanced id="so-wi-gating-advanced">
        <FieldLabel htmlFor="so-wi-gating-mode" setting="worldInfo.gatingMode" />
        <select id="so-wi-gating-mode" value={mode} disabled={busy} onChange={(event) => onChoose(event.target.value === "scan" ? "scan" : "file")}>
          <option value="file">Change the lorebook files</option>
          <option value="scan">Per chat</option>
        </select>
        <div className="text-xs opacity-70">
          {mode === "scan"
            ? "Story lorebook entries rest off in their files; each chat sees its own story's entries switched on."
            : "Story Orchestrator switches story lorebook entries on and off in their files as a chat moves."}
        </div>
      </Advanced>
      {mode === "scan" && status && (
        <div data-so="wi-ledger" className="text-xs opacity-70">
          {status.active ? "Active" : busy ? "Preparing" : "Not active"} · {plural(status.ledger.entries, "entry rests", "entries rest")} off in {plural(status.ledger.books, "lorebook", "lorebooks")}
          {status.missing.length ? ` · ${plural(status.missing.length, "entry", "entries")} no longer in its lorebook` : ""}
          {status.unreadable.length ? ` · could not read ${status.unreadable.join(", ")}` : ""}
        </div>
      )}
      {authorView && (
        <div data-so="wi-scan-memory" className="flex flex-col gap-1">
          <CheckRow id="so-wi-scan-memory" setting="worldInfo.scanMemory" className="text-xs" checked={scanMemory} onChange={onScanMemory} />
          <span className="text-xs opacity-70">{settingHelp("worldInfo.scanMemory")}</span>
        </div>
      )}
      {unavailable && (
        <div data-so="wi-unavailable" className="text-xs so-warning-text">Per-chat gating is unavailable on this SillyTavern; lorebooks are gated by file writes.</div>
      )}
      {mode === "scan" && fixable.length > 0 && (
        <div data-so="wi-drift" className="flex flex-col gap-1 text-xs so-warning-text">
          {status?.drift.length ? <span>Switched on outside the story, so chats without it see {status.drift.length === 1 ? "it" : "them"}: {entryCount(status.drift)}</span> : null}
          {status?.missingKey.length ? <span>Cannot be switched off per chat: {entryCount(status.missingKey)}</span> : null}
          <button id="so-wi-renormalize" type="button" className="menu_button self-start" disabled={busy} onClick={onRenormalize}>Switch {fixable.length === 1 ? "it" : "them"} off again</button>
        </div>
      )}
      {authorView && (unavailable || fixable.length > 0) && <WiGatingAuthorDetail status={status} unavailable={unavailable} />}
    </div>
  );
}

export default WorldInfoGatingGroup;

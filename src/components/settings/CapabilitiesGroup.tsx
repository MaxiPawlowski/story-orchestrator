import { useState } from "react";
import type { CapabilityReport, HostFacts } from "@services/STAPI";

export interface CapabilitiesGroupProps {
  reports: CapabilityReport[] | "checking";
  /** v2.3 plan 08: what it is running on, which a present/absent probe cannot say. */
  facts?: HostFacts | null;
  extensionVersion?: string;
  /** v2.4 plan 03 D5: the memory model's context limit and where it came from, never failed closed. */
  memoryModel?: MemoryModelLimit | null;
  onRefresh(): void;
  onCopy?(text: string): void;
}

// v2.3 plan 06/08. An install-health read-out, not a control: it exists so a missing host capability is
// named where the author is standing, instead of surfacing as an effect that quietly did nothing, and
// so a bug report carries the version, the engine and every probe in one paste. Nothing here is a
// story spoiler, so it needs no persona gate.
export interface MemoryModelLimit {
  value: number;
  source: "preset" | "default";
  reason?: string;
  inputBudget: number;
}

const tokens = (value: number) => value.toLocaleString("en-US");

export const describeMemoryModelLimit = (limit: MemoryModelLimit) =>
  `Memory model context: ${tokens(limit.value)} tokens ${limit.source === "preset" ? "(from its preset)" : `(default${limit.reason ? `: ${limit.reason}` : ""})`} · up to ` +
    `${tokens(limit.inputBudget)} per read`;

export function CapabilitiesGroup({ reports, facts = null, extensionVersion = "", memoryModel = null, onRefresh, onCopy }: CapabilitiesGroupProps) {
  const checking = reports === "checking";
  const broken = checking ? [] : reports.filter((report) => report.state !== "present");
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const report = [
    `Story Orchestrator ${extensionVersion || "(version unknown)"}`,
    `SillyTavern ${facts?.stVersion ?? "unknown"}${facts?.stCommit ? ` (${facts.stCommit})` : ""}`,
    `macros: ${facts?.macroEngine ?? "unknown"} engine`,
    ...(memoryModel ? [describeMemoryModelLimit(memoryModel)] : []),
    ...(checking ? ["capabilities: checking"] : reports.map((entry) => `${entry.id}: ${entry.state} — ${entry.detail}`)),
  ].join("\n");

  const copy = async () => {
    try {
      if (onCopy) onCopy(report);
      else await navigator.clipboard.writeText(report);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div id="so-capabilities" className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
      {/* The label plus two buttons is wider than ST's extensions drawer on a phone, and a
          non-wrapping row spilled outside the panel (measured at 24 viewports, 2026-09-22). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">Host capabilities</span>
        <button className="menu_button text-xs" onClick={onRefresh} disabled={checking}>Recheck</button>
        <button id="so-copy-diagnostics" className="menu_button text-xs" onClick={() => void copy()}>
          {copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy for a bug report"}
        </button>
        <span className="text-xs opacity-70">
          {checking ? "Checking…" : broken.length ? `${broken.length} of ${reports.length} unavailable` : "Everything this extension needs is here"}
        </span>
      </div>
      {facts && (
        <div id="so-host-facts" className="text-xs opacity-80">
          SillyTavern {facts.stVersion ?? "unknown"}{facts.stCommit ? ` (${facts.stCommit})` : ""} · {facts.macroEngine} macro engine{extensionVersion ? ` · extension ${extensionVersion}` : ""}
        </div>
      )}
      {memoryModel && <div id="so-context-limit" className="text-xs opacity-80">{describeMemoryModelLimit(memoryModel)}</div>}
      {broken.map((report) => (
        <div key={report.id} id={`so-capability-${report.id}`} className="text-xs text-yellow-300">
          <span className="font-medium">{report.id}</span>
          {report.state === "error" ? " could not be checked" : " is unavailable"}: {report.detail}
        </div>
      ))}
    </div>
  );
}

export default CapabilitiesGroup;

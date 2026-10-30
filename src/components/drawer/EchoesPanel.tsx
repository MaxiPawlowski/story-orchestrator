import type { EchoAuthorView } from "@engine/life/echoView";

const LABEL: Record<string, string> = {
  scheduled: "scheduled", due: "due", waiting: "waiting", "landed-to-channel": "landed to channel", offered: "offered",
  cancelled: "cancelled", expired: "expired", lapsed: "lapsed",
};

export const EchoesPanel = ({ view }: { view: EchoAuthorView }) => {
  if (!view.rows.length && !view.gaps.length) return null;
  const open = view.rows.filter((row) => row.state === "scheduled" || row.state === "due" || row.state === "waiting").length;
  return (
    <details id="so-echoes" data-so="echoes" className="border-t border-solid border-[var(--so-line)] mt-1 pt-1">
      <summary className="opacity-100 cursor-pointer">Echoes ({view.rows.length - open} handed over or ended, {open} on the way)</summary>
      <ul className="list-none p-0 m-0">
        {view.rows.map((row) => (
          <li key={row.occurrenceId} data-so="echo-row" data-echo={row.echoId} data-state={row.state} className="opacity-80 mt-1">
            <span>{row.echoId} → {row.recipient}: {LABEL[row.state] ?? row.state}, {row.detail}</span>
            <div className="opacity-70" data-so="echo-source">after {row.source}</div>
          </li>
        ))}
        {view.gaps.map((gap) => (
          <li key={`${gap.from}-${gap.to}-${gap.reason}`} data-so="echo-gap" className="opacity-70 mt-1">
            Turns {gap.from}–{gap.to} were not scanned: {gap.reason === "log" ? "older than the kept history" : "their check records were dropped"}.
          </li>
        ))}
      </ul>
    </details>
  );
};

import type { RumorAuthorRow } from "@memory/rumors/lines";

const STANCE: Record<string, string> = { believes: "believes it", doubts: "doubts it", unsure: "not sure" };

const count = (rows: RumorAuthorRow[], status: RumorAuthorRow["status"]) => rows.filter((row) => row.status === status).length;

const hopText = (row: RumorAuthorRow) => `${row.rumorId}: ${row.from} → ${row.to} (hop ${row.hop}${row.leak ? ", leak" : ""}) · `
  + (row.status === "landed" ? `heard, ${STANCE[row.stance ?? "unsure"]}` : `due ${row.due}`);

export const RumorsPanel = ({ rows }: { rows: RumorAuthorRow[] }) => {
  if (!rows.length) return null;
  return (
    <details id="so-rumors" data-so="rumors" className="border-t border-solid border-white/10 mt-1 pt-1">
      <summary className="opacity-100 cursor-pointer">Rumors ({count(rows, "landed")} heard, {count(rows, "pending")} on the way)</summary>
      <ul className="list-none p-0 m-0">
        {rows.map((row, index) => (
          <li key={`${row.rumorId}-${row.to}-${index}`} data-so="rumor-row" data-rumor={row.rumorId} data-status={row.status} className="opacity-80 mt-1">
            {row.status === "origin"
              ? <span>{row.rumorId}: started with {row.to}</span>
              : <span>{hopText(row)}</span>}
            {row.status !== "origin" && <div className="opacity-70" data-so="rumor-version">{row.version}</div>}
          </li>
        ))}
      </ul>
    </details>
  );
};

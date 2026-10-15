import type { CodexEntryView } from "@runtime/gameTypes";
import { CODEX_TEXT } from "@features/codexCopy";

export interface CodexPageProps {
  page: "people" | "places";
  entries: CodexEntryView[];
}

const Entry = ({ entry }: { entry: CodexEntryView }) => (
  <li data-so="codex-entry" data-fresh={entry.fresh} className="st-subpanel flex flex-col gap-1 p-2">
    <div className="flex items-center gap-2 text-sm font-medium">
      <span>{entry.name}</span>
      {entry.fresh && <span data-so="codex-fresh" className="st-pill px-1.5 text-[10px]">{CODEX_TEXT.fresh}</span>}
    </div>
    {entry.facts.length > 0 && (
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
        {entry.facts.map((fact, index) => (
          <li key={index} data-so="codex-fact" data-fresh={fact.fresh}>
            <span>{fact.text}</span>
            {fact.fresh && <span className="st-pill ml-1 px-1.5 text-[10px]">{CODEX_TEXT.fresh}</span>}
            {fact.from && <div data-so="codex-from" className="st-muted text-[11px]">{fact.from}</div>}
          </li>
        ))}
      </ul>
    )}
    {entry.rows && entry.rows.length > 0 && (
      <ul data-so="codex-rows" className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
        {entry.rows.map((row, index) => <li key={index}>{row.text}</li>)}
      </ul>
    )}
  </li>
);

export function CodexPage({ page, entries }: CodexPageProps) {
  if (!entries.length) return null;
  return (
    <section data-so={`codex-${page}`} aria-label={page === "people" ? CODEX_TEXT.people : CODEX_TEXT.places} className="flex flex-col gap-2">
      <div data-so="codex-count" className="st-muted text-xs">{page === "people" ? CODEX_TEXT.countPeople(entries.length) : CODEX_TEXT.countPlaces(entries.length)}</div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {entries.map((entry, index) => <Entry key={index} entry={entry} />)}
      </ul>
    </section>
  );
}

export default CodexPage;

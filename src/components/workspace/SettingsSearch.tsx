import { useRef, useState } from "react";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import type { SettingsSearchEntry } from "@features/settingsIndex";
import { SearchField } from "@components/ui/SearchField";

export interface SearchPick {
  intent: WorkspaceIntent;
}

type IndexModule = typeof import("@features/settingsIndex");

export interface SettingsSearchProps {
  authorView: boolean;
  onPick: (pick: SearchPick) => void;
  load?: () => Promise<IndexModule>;
}

const loadIndex = (): Promise<IndexModule> => import("@features/settingsIndex");

export const SettingsSearch = ({ authorView, onPick, load = loadIndex }: SettingsSearchProps) => {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<{ module: IndexModule; entries: SettingsSearchEntry[] } | null>(null);
  const loading = useRef(false);
  const ensure = () => {
    if (index || loading.current) return;
    loading.current = true;
    void load().then((module) => setIndex({ module, entries: module.buildSettingsIndex(authorView) })).finally(() => { loading.current = false; });
  };
  const results = index && query.trim() ? index.module.searchSettings(index.entries, query) : [];
  const choose = (entry: SettingsSearchEntry) => { setQuery(""); onPick({ intent: entry.intent }); };
  return (
    <div className="so-settings-search" data-so="settings-search" onFocus={ensure}
      onKeyDown={(event) => {
        if (event.key === "Enter" && results[0] && (event.target as HTMLElement).id === "so-settings-search") { event.preventDefault(); choose(results[0]); }
        if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery(""); }
      }}>
      <SearchField id="so-settings-search" label="Search all settings" value={query} onChange={(value) => { ensure(); setQuery(value); }} />
      {query.trim() && <div id="so-settings-search-results" className="so-settings-search-results" role="region" aria-label="Search results" aria-live="polite">
        {!index ? <p className="so-setting-desc">Loading…</p> : results.length ? <ul>
          {results.map((entry) => <li key={entry.id}>
            <button type="button" data-so="settings-search-result" data-entry={entry.id} onClick={() => choose(entry)}>
              <span className="so-search-result-label">{entry.label}</span>
              <span className="so-search-result-crumb">{entry.crumb}</span>
            </button>
          </li>)}
        </ul> : <p className="so-setting-desc">Nothing matches “{query.trim()}”.</p>}
      </div>}
    </div>
  );
};

export default SettingsSearch;

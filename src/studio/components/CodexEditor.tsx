import React from "react";
import { CODEX_START, isReached, type CodexEntry, type CodexFact, type CodexKnownWhen, type CodexPage, type Quality } from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import { removeCodexEntry, setCodexShown, updateCodexEntry } from "../gameMutations";
import { nextId } from "../mutations";
import GateBuilder from "./GateBuilder";
import { TextField, optionalText } from "./GameFields";

const HELP = "People and Places fill the player's Journal as they learn. A line shows only once its condition holds, and stays; a swipe of the reply that earned it takes it back.";

type Mode = "none" | "start" | "reached" | "gate";

const modeOf = (when: CodexKnownWhen | undefined): Mode => (!when ? "none" : when === CODEX_START ? "start" : isReached(when) ? "reached" : "gate");

interface KnownWhenProps {
  label: string;
  when: CodexKnownWhen | undefined;
  allowNone: boolean;
  qualities: Quality[];
  checkpoints: string[];
  onChange: (when: CodexKnownWhen | undefined) => void;
}

const KnownWhenField: React.FC<KnownWhenProps> = ({
  label, when, allowNone, qualities, checkpoints, onChange,
}) => {
  const mode = modeOf(when);
  const pick = (next: Mode) => onChange(next === "none" ? undefined : next === "start" ? CODEX_START : next === "reached" ? { reached: checkpoints[0] ?? "" } : { all: [] });
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs st-muted">{label}</span>
        <select aria-label={label} value={mode} onChange={(event) => pick(event.target.value as Mode)}>
          {allowNone && <option value="none">When a line about it is known</option>}
          <option value="start">From the start</option>
          <option value="reached">When a checkpoint is reached</option>
          <option value="gate">When a condition holds</option>
        </select>
        {isReached(when) && (
          <select aria-label={`${label} checkpoint`} value={when.reached} onChange={(event) => onChange({ reached: event.target.value })}>
            {checkpoints.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        )}
      </label>
      {mode === "gate" && when && when !== CODEX_START && !isReached(when) && <GateBuilder gate={when} qualities={qualities} onChange={onChange} />}
    </div>
  );
};

const FactRow: React.FC<{ page: CodexPage; entry: CodexEntry; fact: CodexFact; sources: string[] }> = ({ page, entry, fact, sources }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const qualities = useDraftStore((state) => state.draft.qualities);
  const checkpoints = useDraftStore((state) => state.draft.checkpoints.map((checkpoint) => checkpoint.id));
  const patch = (value: Partial<CodexFact>) => mutate((current) =>
    updateCodexEntry(current, page, { ...entry, facts: entry.facts.map((item) => (item.id === fact.id ? { ...item, ...value } : item)) }));
  const label = `${entry.id}.${fact.id}`;
  return (
    <div data-so="codex-fact-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{fact.id}</span>
        <TextField label={`${label} text`} value={fact.text} onChange={(text) => patch({ text })} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">From</span>
          <select aria-label={`${label} source`} value={fact.source ?? ""} onChange={(event) => patch({ source: optionalText(event.target.value) })}>
            <option value="">(nobody)</option>
            {sources.filter((id) => id !== entry.id).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Revision</span>
          <input type="number" min={1} className="text_pole st-input w-16" aria-label={`${label} rev`} value={fact.rev ?? 1}
            onChange={(event) => { const rev = Number(event.target.value); if (Number.isInteger(rev) && rev >= 1) patch({ rev: rev > 1 ? rev : undefined }); }} />
        </label>
        <button type="button" className="st-button danger" aria-label={`Remove fact ${label}`}
          onClick={() => mutate((current) => updateCodexEntry(current, page, { ...entry, facts: entry.facts.filter((item) => item.id !== fact.id) }))}>×</button>
      </div>
      <KnownWhenField label={`${label} known when`} when={fact.known_when} allowNone={false} qualities={qualities} checkpoints={checkpoints}
        onChange={(known) => patch({ known_when: known ?? CODEX_START })} />
    </div>
  );
};

const EntryRow: React.FC<{ page: CodexPage; entry: CodexEntry; sources: string[] }> = ({ page, entry, sources }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const draft = useDraftStore((state) => state.draft);
  const locations = draft.qualities.find((quality) => quality.key === "location" && quality.type === "enum")?.values ?? [];
  const patch = (value: Partial<CodexEntry>) => mutate((current) => updateCodexEntry(current, page, { ...entry, ...value }));
  const addFact = () => patch({ facts: [...entry.facts, { id: nextId(entry.facts.map((fact) => fact.id), "fact"), text: "", known_when: { reached: draft.checkpoints[0]?.id ?? "" } }] });
  return (
    <div data-so="codex-entry-row" className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{entry.id}</span>
        <TextField label={`${entry.id} name`} value={entry.name ?? ""} onChange={(name) => patch({ name: optionalText(name) })} />
        {page === "people" ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Cast member</span>
            <select aria-label={`${entry.id} member`} value={entry.member ?? ""} onChange={(event) => patch({ member: optionalText(event.target.value) })}>
              <option value="">(not in the cast)</option>
              {draft.roster.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.id}</option>)}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs st-muted">Location value</span>
            <select aria-label={`${entry.id} location`} value={entry.location ?? ""} onChange={(event) => patch({ location: optionalText(event.target.value) })}>
              <option value="">(none)</option>
              {locations.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        <TextField label={`${entry.id} aliases`} value={(entry.aliases ?? []).join(", ")}
          onChange={(text) => { const aliases = text.split(",").map((name) => name.trim()).filter(Boolean); patch({ aliases: aliases.length ? aliases : undefined }); }} />
        <button type="button" className="st-button danger" aria-label={`Remove ${page} ${entry.id}`} onClick={() => mutate((current) => removeCodexEntry(current, page, entry.id))}>×</button>
      </div>
      <KnownWhenField label={`${entry.id} known when`} when={entry.known_when} allowNone qualities={draft.qualities} checkpoints={draft.checkpoints.map((checkpoint) => checkpoint.id)}
        onChange={(known) => patch({ known_when: known })} />
      {entry.facts.map((fact) => <FactRow key={fact.id} page={page} entry={entry} fact={fact} sources={sources} />)}
      <button type="button" className="st-button secondary self-start" onClick={addFact}>+ Fact</button>
    </div>
  );
};

const PageEditor: React.FC<{ page: CodexPage }> = ({ page }) => {
  const entries = useDraftStore((state) => state.draft.codex?.[page]) ?? [];
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const ids = [...(draft.codex?.people ?? []), ...(draft.codex?.places ?? [])].map((entry) => entry.id);
  const sources = [...new Set([...ids, ...draft.roster.map((member) => member.id)])];
  const add = () => mutate((current) => updateCodexEntry(current, page, { id: nextId(ids, page === "people" ? "person" : "place"), name: page === "people" ? "Someone" : "Somewhere", facts: [] }));
  return (
    <div data-so={`codex-editor-${page}`} className="flex flex-col gap-2">
      <div className="text-sm font-medium">{page === "people" ? "People" : "Places"}</div>
      {entries.map((entry) => <EntryRow key={entry.id} page={page} entry={entry} sources={sources} />)}
      <button type="button" className="st-button secondary self-start" onClick={add}>{page === "people" ? "+ Person" : "+ Place"}</button>
    </div>
  );
};

const CodexEditor: React.FC = () => {
  const shown = useDraftStore((state) => state.draft.display?.codex !== false);
  const mutate = useDraftStore((state) => state.mutate);
  return (
    <div id="so-codex-editor" data-so="codex-editor" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">People and Places<HelpTooltip title={HELP} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="Show People and Places to players" checked={shown} onChange={(event) => mutate((current) => setCodexShown(current, event.target.checked))} />
        Show People and Places to players
      </label>
      <PageEditor page="people" />
      <PageEditor page="places" />
    </div>
  );
};

export default CodexEditor;

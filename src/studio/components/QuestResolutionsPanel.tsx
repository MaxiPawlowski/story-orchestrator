import React, { useMemo, useState } from "react";
import { isValidationErrorList, parseStory, renderGateText, type PrimitiveValue, type Quest, type QuestResolution } from "@engine/index";
import { simulateQuest } from "@engine/questSimulation";
import { useDraftStore } from "../draft";
import { updateQuest } from "../gameMutations";
import { questMatrix } from "../questMatrix";
import { JsonField, TextField } from "./GameFields";
import { Switch } from "@components/ui/Switch";
import { Button } from "@components/ui/Button";

const MatrixTable = ({ quest }: { quest: Quest }) => {
  const draft = useDraftStore((state) => state.draft);
  const rows = useMemo(() => questMatrix(draft, quest), [draft, quest]);
  if (!rows.length) return null;
  return (
    <table data-so="quest-matrix" className="text-xs w-full">
      <thead><tr><th>Resolution</th><th>Consequences</th><th>Read by</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-resolution={row.id}>
            <td>{row.id}{row.label ? ` · “${row.label}”` : ""}{row.from.includes("offered") ? " · from offered" : ""}</td>
            <td>
              {row.consequences.length ? row.consequences.map((consequence) => (
                <div key={consequence.id} data-consequence={consequence.id}>
                  {consequence.id}{consequence.when ? ` if ${renderGateText(consequence.when)}` : ""}
                  {consequence.writes.length ? ` · sets ${consequence.writes.join(", ")}` : ""}
                  {consequence.effects.length ? ` · ${consequence.effects.join(", ")}` : ""}
                </div>
              )) : <span className="st-muted">none</span>}
            </td>
            <td>{row.readers.length ? row.readers.join("; ") : <span className="st-muted">nothing yet</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const readValues = (text: string): Record<string, PrimitiveValue> | null => {
  try {
    const parsed: unknown = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, PrimitiveValue> : null;
  } catch {
    return null;
  }
};

const Simulator = ({ quest }: { quest: Quest }) => {
  const draft = useDraftStore((state) => state.draft);
  const story = useMemo(() => parseStory(draft), [draft]);
  const [values, setValues] = useState("{}");
  const [force, setForce] = useState("");
  const [result, setResult] = useState<string[] | null>(null);
  const ids = useMemo(() => questMatrix(draft, quest).map((row) => row.id), [draft, quest]);
  const run = () => {
    const parsed = readValues(values);
    if (isValidationErrorList(story)) return setResult([`The story does not validate yet: ${story[0]?.message ?? ""}`]);
    if (!parsed) return setResult(["Values are a JSON object of quality values."]);
    const outcome = simulateQuest(story, quest.id, parsed, true, force || undefined);
    if (!outcome) return setResult(["This quest is not in the validated story."]);
    setResult([
      outcome.resolution ? `Closes on ${outcome.resolution}` : outcome.held ? `Held open: ${outcome.matched.join(" and ")} both match` : `Stays ${outcome.lifecycle}`,
      ...outcome.consequences.map((consequence) => `${consequence.id}: ${consequence.applied ? "applies" : "does not apply"}${consequence.shown ? ", shown to the player" : ""}`),
      ...outcome.writes.map((write) => `${write.key}: ${String(write.before ?? "∅")} → ${String(write.after ?? "∅")}`),
      `Journal shows: ${outcome.player.status ?? "no ending"}${outcome.player.outcomes.length ? ` · ${outcome.player.outcomes.join(" · ")}` : ""}`,
    ]);
  };
  return (
    <div data-so="quest-simulator" className="flex flex-col gap-1">
      <div className="text-xs st-muted">Simulate: set the method qualities, optionally force a resolution, and see what fires and what each surface shows.</div>
      <TextField label={`${quest.id} simulate values`} value={values} placeholder='{"used_violence": true}' onChange={setValues} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs st-muted">{`${quest.id} simulate resolution`}</span>
        <select className="text_pole st-input" aria-label={`${quest.id} simulate resolution`} value={force} onChange={(event) => setForce(event.target.value)}>
          <option value="">(decided by the gates)</option>
          {ids.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <Button type="button" className="self-start" onClick={run}>Simulate</Button>
      {result && <ul data-so="quest-simulation" className="text-xs m-0 pl-4">{result.map((line) => <li key={line}>{line}</li>)}</ul>}
    </div>
  );
};

const QuestResolutionsPanel = ({ quest }: { quest: Quest }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const patch = (value: Partial<Omit<Quest, "id">>) => mutate((current) => updateQuest(current, quest.id, value));
  const name = quest.id;
  const [order, setOrder] = useState((quest.precedence ?? []).join(", "));
  return (
    <div data-so="quest-resolutions" className="flex flex-col gap-2">
      <JsonField label={`${name} resolutions`} hint="[{id, when, label?, recap?, from?: [offered|active], consequences?: [{id, when?, set?, effects?, label?, visible_when?}]}]"
        value={quest.resolutions} onChange={(resolutions) => patch({ resolutions: resolutions as QuestResolution[] | undefined })} />
      <TextField label={`${name} precedence`} value={order} placeholder="first wins: abandoned, freed, done"
        onChange={(text) => {
          setOrder(text);
          const ids = text.split(",").map((id) => id.trim()).filter(Boolean);
          patch({ precedence: ids.length ? ids : undefined });
        }} />
      <div className="flex items-center gap-2 text-sm">
        <Switch label={`${name} holds open when two endings match`} checked={quest.hold_when_ambiguous === true}
          onChange={(on) => patch({ hold_when_ambiguous: on ? true : undefined })} />
        <span>Hold open when two endings match</span>
      </div>
      <MatrixTable quest={quest} />
      <Simulator quest={quest} />
    </div>
  );
};

export default QuestResolutionsPanel;

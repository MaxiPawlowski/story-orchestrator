import { useEffect, useState } from "react";
import * as hostApi from "@services/stHost/modelDownloads";
import { MODEL_PROVIDERS, type DownloadCard, type DownloadJob, type ModelProvider } from "@services/stHost/modelDownloads";
import { cardLines, jobLine, readModelRef } from "./downloadCopy";

export type ModelSourcesApi = Pick<typeof hostApi, "modelKeyStatus" | "testModelKey" | "writeModelKey" | "planModelDownload" | "startModelDownload" | "modelDownloads" | "cancelModelDownload">;

const LABEL: Record<ModelProvider, string> = { civitai: "Civitai token", huggingface: "Hugging Face token" };
const KINDS = ["", "checkpoints", "loras", "upscaleModels", "embeddings", "vaes", "diffusionModels", "textEncoders", "textModels"];
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function ModelSources({ api = hostApi }: { api?: ModelSourcesApi }) {
  const [keys, setKeys] = useState<Record<ModelProvider, boolean> | null>(null);
  const [drafts, setDrafts] = useState<Record<ModelProvider, string>>({ civitai: "", huggingface: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ModelProvider>("civitai");
  const [fields, setFields] = useState({ version: "", repo: "", file: "", revision: "", kind: "" });
  const [card, setCard] = useState<DownloadCard | null>(null);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const note = (key: string, text: string) => setNotes((prev) => ({ ...prev, [key]: text }));
  useEffect(() => { void api.modelKeyStatus().then(setKeys, (error: unknown) => note("keys", message(error))); }, [api]);
  useEffect(() => {
    if (!jobs.some((job) => ["queued", "running", "verifying"].includes(job.state))) return undefined;
    const timer = setInterval(() => { void api.modelDownloads().then(setJobs, (error: unknown) => note("jobs", message(error))); }, 1500);
    return () => clearInterval(timer);
  }, [api, jobs]);
  const check = async () => {
    setCard(null);
    const ref = readModelRef(provider, fields);
    if (typeof ref === "string") { note("card", ref); return; }
    try { setCard(await api.planModelDownload(provider, ref, fields.kind || undefined)); note("card", ""); } catch (error) { note("card", message(error)); }
  };
  return <div id="so-model-sources" className="flex flex-col gap-2">
    <p className="text-xs opacity-80">Tokens are stored in SillyTavern's secrets and read only by the media plugin; this page never sees them again.
      Nothing downloads unless you press Download on a card. Downloads are admin-only.</p>
    {MODEL_PROVIDERS.map((id) => <div key={id} className="flex flex-col gap-1" data-so={`model-key-${id}`}>
      <label className="text-xs" htmlFor={`so-model-key-${id}`}>{LABEL[id]} <span className="opacity-70">({keys ? (keys[id] ? "set" : "not set") : "unknown"})</span></label>
      <div className="flex gap-1">
        <input id={`so-model-key-${id}`} type="password" autoComplete="off" className="text_pole" value={drafts[id]}
          onChange={(event) => setDrafts((prev) => ({ ...prev, [id]: event.target.value }))} />
        <button type="button" className="st-button" disabled={!drafts[id].trim()} onClick={() => {
          void api.writeModelKey(id, drafts[id]).then((result) => {
            setDrafts((prev) => ({ ...prev, [id]: "" }));
            note(id, result.ok ? "Saved." : result.reason);
            if (result.ok) setKeys((prev) => ({ civitai: false, huggingface: false, ...prev, [id]: true }));
          });
        }}>Save</button>
        <button type="button" className="st-button" onClick={() => {
          void api.testModelKey(id).then((answer) => note(id, answer.message), (error: unknown) => note(id, message(error)));
        }}>Test</button>
      </div>
      {notes[id] ? <p role="status" className="text-xs">{notes[id]}</p> : null}
    </div>)}
    <fieldset className="flex flex-col gap-1 rounded border p-2">
      <legend className="font-semibold">Download a model</legend>
      <select aria-label="Model source" className="text_pole" value={provider} onChange={(event) => { setProvider(event.target.value as ModelProvider); setCard(null); }}>
        <option value="civitai">Civitai</option><option value="huggingface">Hugging Face</option>
      </select>
      {provider === "civitai"
        ? <input aria-label="Civitai model version" className="text_pole" placeholder="Model version id or a link with modelVersionId=" value={fields.version}
          onChange={(event) => setFields({ ...fields, version: event.target.value })} />
        : <>
          <input aria-label="Hugging Face repository" className="text_pole" placeholder="owner/name" value={fields.repo} onChange={(event) => setFields({ ...fields, repo: event.target.value })} />
          <input aria-label="File in the repository" className="text_pole" placeholder="path inside the repository" value={fields.file}
            onChange={(event) => setFields({ ...fields, file: event.target.value })} />
          <input aria-label="Revision" className="text_pole" placeholder="main" value={fields.revision} onChange={(event) => setFields({ ...fields, revision: event.target.value })} />
        </>}
      <select aria-label="Model kind" className="text_pole" value={fields.kind} onChange={(event) => setFields({ ...fields, kind: event.target.value })}>
        {KINDS.map((kind) => <option key={kind} value={kind}>{kind || "Kind from the source"}</option>)}
      </select>
      <button type="button" className="st-button" onClick={() => { void check(); }}>Check</button>
      {notes.card ? <p role="status" className="text-xs">{notes.card}</p> : null}
      {card ? <div data-so="model-download-card" className="flex flex-col gap-1 rounded border p-2 text-xs">
        {cardLines(card).map((line) => <span key={line}>{line}</span>)}
        <a href={card.termsUrl} target="_blank" rel="noreferrer" className="underline">License and terms</a>
        <button type="button" className="st-button" disabled={card.present || !card.fits} onClick={() => {
          void api.startModelDownload(card.id).then((job) => setJobs((prev) => [...prev, job]), (error: unknown) => note("card", message(error)));
        }}>Download</button>
      </div> : null}
    </fieldset>
    {jobs.map((job) => <div key={job.id} className="flex items-center gap-2 text-xs" data-so="model-download-job">
      <span role="status">{jobLine(job)}</span>
      {["queued", "running"].includes(job.state)
        ? <button type="button" className="st-button" onClick={() => {
          void api.cancelModelDownload(job.id).then((next) => setJobs((prev) => prev.map((row) => (row.id === next.id ? next : row))));
        }}>Stop</button>
        : null}
    </div>)}
  </div>;
}

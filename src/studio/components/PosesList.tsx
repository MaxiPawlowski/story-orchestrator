import { useEffect, useMemo, useState } from "react";
import type { PoseEntry } from "@engine/schema";
import { readPoseList } from "@engine/validate/poses";
import { poseLibrary } from "../../sprites/poses/library";
import { createPoseBodies } from "../../sprites/poses/bodyHost";
import { spriteBuilderMembers } from "@services/stHost/sprites";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { beginRun, type RunGuard } from "@runtime/runToken";
import { draftOwnership } from "../agentHost";
import { useDraftStore } from "../draft";
import { setMemberPoses, setPoses, setStagePose } from "../poseMutations";
import { lookLayers } from "../../sprites/poses/layers";
import { posesToPrepare } from "../../sprites/poses/prepareList";
import { spriteFilesSaved } from "../../sprites/visualChanges";
import { isValidationErrorList, parseStory } from "@engine/index";
import PoseSkeleton from "./PoseSkeleton";

export interface PosesServices {
  installed(): PoseEntry[];
  saveInstalled(poses: PoseEntry[]): void;
  render(pose: PoseEntry, member: string): Promise<string>;
  importImage?(image: string): Promise<PoseEntry["keypoints"]>;
  prepare?(): Promise<string>;
}

const host: PosesServices = {
  installed: () => getGlobalSettings().sprites.customPoses,
  saveInstalled: (poses) => { setGlobalSettings({ sprites: { customPoses: poses } }); },
  render: async (pose, id) => {
    const draft = useDraftStore.getState().draft, member = draft.roster.find((member) => member.id === id);
    if (!member) throw new Error("Choose a member of this story first.");
    const target = spriteBuilderMembers([member.name ?? id])[0], settings = getGlobalSettings().sprites;
    const config = target && settings.builders[target.folder];
    if (!target || !config) throw new Error("Choose this member's reference pack in Sprites first.");
    const renderer = createPoseBodies(draftOwnership);
    let path = "", error = "";
    try {
      await renderer.render({ story: draft.id ?? useDraftStore.getState().draftKey, member: id, folder: target.folder, cardArt: target.image,
        label: "neutral", pose, layers: lookLayers(member.card, {}), config, accepts: () => true,
        apply: (result) => { path = result.files[0]?.path ?? ""; }, failed: (reason) => { error = reason; } });
      if (!path) throw new Error(error || "The pose preview was not saved.");
      return path;
    } finally { renderer.close(); }
  },
  importImage: async (image) => (await import("../../sprites/poses/importHost")).importPoseImage(image, draftOwnership),
  prepare: async () => {
    const { draft, draftKey } = useDraftStore.getState(), parsed = parseStory(draft), settings = getGlobalSettings().sprites;
    if (isValidationErrorList(parsed)) throw new Error("Fix the story's validation errors before preparing poses.");
    const jobs = posesToPrepare(parsed, settings.customPoses);
    if (!jobs.length) return "Nothing to prepare: no member has a default or directed pose that differs from the base.";
    const renderer = createPoseBodies(draftOwnership), problems: string[] = [];
    let ready = 0;
    try {
      for (const job of jobs) {
        const target = spriteBuilderMembers([job.name])[0], config = target && settings.builders[target.folder];
        if (!target || !config) { problems.push(`${job.name}: choose a reference pack in Sprites first.`); continue; }
        let saved = false, error = "";
        await renderer.render({ story: draft.id ?? draftKey, member: job.member, folder: target.folder, cardArt: target.image, label: "neutral", pose: job.pose,
          layers: job.layers, config, frames: settings.blink || settings.mouth !== "off", accepts: () => true,
          apply: () => { saved = true; }, failed: (reason) => { error = reason; } });
        if (saved) ready += 1;
        else problems.push(`${job.name}, ${job.pose.label}: ${error || "not saved"}`);
      }
    } finally { renderer.close(); if (ready) spriteFilesSaved(); }
    return [`Prepared ${ready} of ${jobs.length} story pose(s).`, ...problems].join(" ");
  },
};

export default function PosesList({ services = host }: { services?: PosesServices }) {
  const draft = useDraftStore((state) => state.draft), mutate = useDraftStore((state) => state.mutate);
  const [installed, setInstalled] = useState(() => services.installed());
  const poses = useMemo(() => poseLibrary(draft.poses, installed), [draft.poses, installed]);
  const [selected, setSelected] = useState("stand_relaxed"), [member, setMember] = useState(draft.roster[0]?.id ?? "");
  const [json, setJson] = useState(""), [scope, setScope] = useState("story"), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [alive] = useState(() => ({ current: true }));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, [alive]);
  const pose = poses.find((pose) => pose.id === selected) ?? poses[0];
  const setUse = (use: string[]) => mutate((current) => setPoses(current, { ...current.poses, use }));
  const importJson = () => {
    try {
      const raw: unknown = JSON.parse(json), errors: Array<{ path: string; message: string }> = [];
      const additions = readPoseList(Array.isArray(raw) ? raw : [raw], "import", errors);
      if (errors.length) throw new Error(errors.map((error) => `${error.path}: ${error.message}`).join("; "));
      const merge = (entries: PoseEntry[]) => [...new Map([...entries, ...additions].map((pose) => [pose.id, pose])).values()];
      if (scope === "story") mutate((current) => setPoses(current, { ...current.poses, custom: merge(current.poses?.custom ?? []) }));
      else { const entries = merge(installed); services.saveInstalled(entries); setInstalled(entries); }
      setNote(`Imported ${additions.length} pose(s).`);
    } catch (error) { setNote(error instanceof Error ? error.message : String(error)); }
  };
  const work = async (runWork: (run: RunGuard) => Promise<string>) => {
    const run = beginRun(draftOwnership);
    setBusy(true); setNote("");
    try { const result = await runWork(run); if (alive.current && run.stillOwns()) setNote(result); }
    catch (error) { if (alive.current && run.stillOwns()) setNote(error instanceof Error ? error.message : String(error)); }
    finally { if (alive.current && run.stillOwns()) setBusy(false); run.release(); }
  };
  return <section id="so-studio-poses" className="flex flex-col gap-2">
    <h3 className="font-semibold">Poses</h3>
    <p className="text-sm">Choose a default, restrict the poses a member can use, or direct a pose at a scene. A changed look renders a whole body when that pose is next used.</p>
    {services.prepare && <button id="so-prepare-poses" type="button" className="st-button" disabled={busy} onClick={() => void work(() => (services.prepare as () => Promise<string>)())}>
      Prepare story poses before play</button>}
    <label>Story pose ids or tags<input aria-label="Story pose ids or tags" className="text_pole" value={draft.poses?.use?.join(", ") ?? ""}
onChange={(event) => event.target.value.trim() ? setUse(event.target.value.split(",").map((id) => id.trim()).filter(Boolean)) : mutate((current) => setPoses(current,
        { custom: current.poses?.custom }))} /></label>
    <label>Member<select aria-label="Pose member" className="text_pole" value={member} onChange={(event) => setMember(event.target.value)}>
      <option value="">Choose a member</option>{draft.roster.map((entry) => <option key={entry.id} value={entry.id}>{entry.name ?? entry.id}</option>)}</select></label>
    <label>Allowed pose ids<input aria-label="Allowed pose ids" className="text_pole" value={draft.roster.find((entry) => entry.id === member)?.sprites?.poses?.join(", ") ?? ""}
      onChange={(event) => mutate((current) => setMemberPoses(current, member, { ...current.roster.find((entry) => entry.id === member)?.sprites,
        poses: event.target.value.trim() ? event.target.value.split(",").map((id) => id.trim()).filter(Boolean) : undefined }))} /></label>
    <label>Pose<select aria-label="Pose" className="text_pole" value={pose?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>
      {poses.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
    {pose && <><PoseSkeleton pose={pose} /><p className="text-sm">{pose.tags.join(", ")} · {pose.framing}{pose.props.length ? ` · needs ${pose.props.join(", ")}` : ""}</p>
      <div className="flex flex-wrap gap-2">
<button type="button" className="st-button" disabled={!member || busy} onClick={() => mutate((current) => setMemberPoses(current, member,
          { ...current.roster.find((entry) => entry.id === member)?.sprites, pose: pose.id }))}>Use as default pose</button>
        <button type="button" className="st-button" disabled={!member || busy || !useDraftStore.getState().selectedCheckpointId}
          onClick={() => mutate((current) => setStagePose(current, useDraftStore.getState().selectedCheckpointId ?? "", member, pose.id))}>Direct at selected scene</button>
        <button type="button" className="st-button" disabled={!member || busy} onClick={() => void work(() => services.render(pose, member))}>Render member in this pose</button>
        <button type="button" className="st-button" onClick={() => setJson(JSON.stringify(pose, null, 2))}>Copy pose to editor</button>
      </div></>}
    <label>Import into<select aria-label="Pose import scope" className="text_pole" value={scope} onChange={(event) => setScope(event.target.value)}>
      <option value="story">This story</option><option value="install">Every story on this install</option></select></label>
    <label>Pose JSON<textarea aria-label="Pose JSON" className="text_pole" rows={5} value={json} onChange={(event) => setJson(event.target.value)} /></label>
    <button type="button" className="st-button" disabled={!json.trim() || busy} onClick={importJson}>Import pose JSON</button>
    <label>Pose reference image<input aria-label="Pose reference image" type="file" accept="image/png" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0];
      if (!file || file.size > 32 * 1024 * 1024) return;
      const run = beginRun(draftOwnership), reader = new FileReader();
      reader.onload = () => { try { if (alive.current && run.stillOwns() && typeof reader.result === "string") setImage(reader.result); } finally { run.release(); } };
      reader.onerror = reader.onabort = () => run.release(); reader.readAsDataURL(file);
    }} /></label>
    <button type="button" className="st-button" disabled={!image || !services.importImage || busy} onClick={() => void work(async (run) => {
      const keypoints = await services.importImage?.(image as string);
if (keypoints && alive.current && run.stillOwns()) setJson(JSON.stringify({ id: "custom_pose", label: "Custom pose", tags: ["gesture"], framing: "full", props: [],
        text: "the imported body pose", version: 1, keypoints }, null, 2));
      return "Skeleton ready in the editor. Give it an id and description, then import it.";
    })}>Extract skeleton with installed DWPose</button>
    <p className="text-xs">DWPose import needs installed estimator files. Downloads wait for the owner’s token and a free GPU.</p>
    {note && <p role="status">{note}</p>}
  </section>;
}

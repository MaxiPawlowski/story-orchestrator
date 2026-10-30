import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { comfyDiscover, comfyFingerprint, spriteManifest, generatedSpriteSets, deleteGeneratedSprite, spriteReferencePack, spriteReferenceSets, type ComfyDiscovery } from "@services/stHost/media";
import { spriteBuilderMembers, spriteList, spriteReferences } from "@services/stHost/sprites";
import { createSpriteBuilder } from "../../sprites/builder/host";
import { decodeImage, encodeImage } from "../../sprites/builder/images";
import { ownBoxRepair, referenceHeadBox } from "../../sprites/builder/headBox";
import { EDIT_RECIPE, EXPRESSIONS, recipeProblems, type EditKind, type EditModels } from "../../sprites/builder/recipes";
import type { HeadBox } from "../../sprites/builder/pixels";
import type { SpriteBuilder as Builder, SpriteCandidate } from "../../sprites/builder/builder";
import { draftOwnership } from "../agentHost";
import { builderRender } from "../../sprites/settings";
import SpriteRenderControls, { useRenderControls } from "./SpriteRenderControls";
import { useDraftStore } from "../draft";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import GeneratedSpriteSets from "./GeneratedSpriteSets";
import ReferencePackPicker from "./ReferencePackPicker";
import BaseSpriteBuilder from "./BaseSpriteBuilder";
import SpriteEditRegion from "./SpriteEditRegion";
import SpritePreview from "./SpritePreview";
import type { FrameRegion } from "../../sprites/builder/frameRegion";
import PresentationRoutes from "./PresentationRoutes";
import { isMouthFrameKey } from "../../sprites/frameKeys";
import { Button } from "@components/ui/Button";

const PosesList = lazy(() => import("./PosesList"));
const PreparePresentation = lazy(() => import("./PreparePresentation"));
const ChangedLookRebuild = lazy(() => import("./ChangedLookRebuild"));

async function selectedHeadBox(image: Awaited<ReturnType<typeof decodeImage>>, reference: string, character: string, services: SpriteBuilderHost) {
  const config = getGlobalSettings().sprites.builders[character];
  const saved = config && reference.includes(`/${config.baseSet}/`) ? config.box : undefined;
  const detect = services.detect;
  return referenceHeadBox(image, saved, detect ? () => detect(encodeImage(image)) : undefined);
}

function useReferenceBox(reference: string, character: string, services: SpriteBuilderHost, setSize: (size: { width: number; height: number }) => void,
  setBox: (box: HeadBox, source: string) => void, setError: (error: string) => void): void {
  useEffect(() => {
    let current = true;
    if (reference) void services.decode(reference).then(async (image) => {
      if (!current) return;
      const box = await selectedHeadBox(image, reference, character, services);
      if (!current) return;
      setSize({ width: image.width, height: image.height });
      setBox(box, boxSource(character, reference));
    }).catch((reason) => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [character, reference, services, setBox, setError, setSize]);
}

const boxSource = (character: string, reference: string): string => JSON.stringify([character, reference]);

function useHeadBox(reference: string, character: string, services: SpriteBuilderHost, setError: (error: string | null) => void) {
  const [box, setBox] = useState<HeadBox>({ x: 0, y: 0, width: 64, height: 64 });
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [boxFor, setBoxFor] = useState("");
  const [repair, setRepair] = useState<HeadBox | null>(null);
  const resolveBox = useCallback((next: HeadBox, source: string) => { setBox(next); setBoxFor(source); }, []);
  useReferenceBox(reference, character, services, setSize, resolveBox, setError);
  useEffect(() => setRepair(null), [character, reference]);
  const boxPending = Boolean(reference) && boxFor !== boxSource(character, reference);
  const offerRepair = (reason: unknown, used: HeadBox) => setRepair(ownBoxRepair(reason, used, services.ownBox?.(character), size));
  const adoptOwnBox = () => {
    if (!repair) return;
    const settings = getGlobalSettings().sprites, config = settings.builders[character];
    if (config) setGlobalSettings({ sprites: { builders: { ...settings.builders, [character]: { ...config, box: { ...repair } } } } });
    resolveBox(repair, boxSource(character, reference)); setRepair(null); setError(null);
  };
  return { box, setBox, size, boxPending, repair, clearRepair: () => setRepair(null), offerRepair, adoptOwnBox };
}

export interface SpriteBuilderHost {
  discover: typeof comfyDiscover;
  fingerprint: typeof comfyFingerprint;
  manifest: typeof spriteManifest;
  members: typeof spriteBuilderMembers;
  list: typeof spriteList;
  decode: typeof decodeImage;
  builder: () => Pick<Builder, "build" | "save" | "cancel" | "close">;
  sets: typeof generatedSpriteSets;
  delete: typeof deleteGeneratedSprite;
  referenceSets: typeof spriteReferenceSets;
  referencePack: typeof spriteReferencePack;
  detect?(png: string): Promise<unknown>;
  ownBox?(character: string): HeadBox | undefined;
}

const detectFace = async (png: string): Promise<unknown> => {
  const reply = await (await import("@services/stHost/landmarkDetector")).detectFaceLandmarks(png, AbortSignal.timeout(30_000));
  return reply.ok ? reply.result : null;
};

const host: SpriteBuilderHost = { discover: comfyDiscover, fingerprint: comfyFingerprint, manifest: spriteManifest,
  members: spriteBuilderMembers, list: spriteReferences, decode: decodeImage, builder: () => createSpriteBuilder(draftOwnership),
  sets: generatedSpriteSets, delete: deleteGeneratedSprite, referenceSets: spriteReferenceSets, referencePack: spriteReferencePack, detect: detectFace,
  ownBox: (character) => getGlobalSettings().sprites.visualSources[character]?.box };

const rosterIdOf = (roster: readonly { id: string; name?: string }[], members: readonly { folder: string; name: string }[], folder: string): string => {
  const name = members.find((member) => member.folder === folder)?.name ?? folder;
  return roster.find((member) => (member.name ?? member.id).toLowerCase() === name.toLowerCase())?.id ?? folder;
};

export default function SpriteBuilder({ services = host }: { services?: SpriteBuilderHost }) {
  const draft = useDraftStore((state) => state.draft);
  const members = services.members((draft.roster ?? []).map((member) => member.name ?? member.id));
  const [character, setCharacter] = useState(members[0]?.folder ?? "");
  const [set, setSet] = useState("pilot");
  const [reference, setReference] = useState("");
  const [sources, setSources] = useState<Array<{ label: string; path: string }>>([]);
  const [discovery, setDiscovery] = useState<ComfyDiscovery | null>(null);
  const [models, setModels] = useState({ diffusion: "", encoder: "", vae: "" });
  const [kind, setKind] = useState<EditKind>("expression");
  const [label, setLabel] = useState("neutral");
  const [value, setValue] = useState("");
  const [seed, setSeed] = useState(1);
  const render = useRenderControls();
  const { steps, resolution } = render;
  const [regions, setRegions] = useState<Record<string, FrameRegion | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SpriteCandidate | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const { box, setBox, size, boxPending, repair, clearRepair, offerRepair, adoptOwnBox } = useHeadBox(reference, character, services, setError);
  const builder = useMemo(() => services.builder(), [services]);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; builder.close(); }; }, [builder]);

  useEffect(() => {
    let current = true;
    setSources([]); setReference(""); setPreview(null); setSaved(null);
    if (character) void services.list(character).then((rows) => {
      if (!current) return;
      setSources(rows); setReference(rows.find((row) => row.label === "neutral")?.path ?? rows[0]?.path ?? "");
    }).catch((reason) => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [character, services]);


  const discover = async () => {
    setBusy(true); setError(null);
    try {
      const found = await services.discover(AbortSignal.timeout(30_000));
      if (live.current) { setDiscovery(found); setModels({ diffusion: found.diffusionModels[0] ?? "", encoder: found.textEncoders[0] ?? "", vae: found.vaes[0] ?? "" }); }
    } catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (live.current) setBusy(false); }
  };

  const generate = async () => {
    if (!discovery) return;
    setBusy(true); setError(null); setPreview(null); setSaved(null); clearRepair();
    try {
      const problems = recipeProblems(discovery, models);
      if (problems.length) throw new Error(problems.join(" "));
      const names = [models.diffusion, models.encoder, models.vae];
      const kinds = ["diffusionModels", "textEncoders", "vaes"];
      const started = performance.now();
      const prints = await Promise.all(names.map((name, index) => services.fingerprint(kinds[index], name, AbortSignal.timeout(600_000))));
      const fingerprintMs = performance.now() - started;
      if (!live.current) return;
      const fingerprints: EditModels = { diffusion: prints[0], encoder: prints[1], vae: prints[2] };
      const result = await builder.build({ character, set, label, kind, value: kind === "look" ? value : label, reference, box, models: fingerprints, seed, steps,
        resolution, frameRegion: regions[reference] });
      if (result.timings) { result.timings.fingerprintMs = fingerprintMs; result.timings.totalMs += fingerprintMs; result.seconds = result.timings.totalMs / 1000; }
      if (live.current) setPreview(result);
    } catch (reason) {
      if (!live.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      offerRepair(reason, box);
    }
    finally { if (live.current) setBusy(false); }
  };

  const save = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const result = await builder.save(preview);
      if (live.current && preview.request.kind === "expression") {
        const settings = getGlobalSettings().sprites;
        const input = preview.request;
        setGlobalSettings({ sprites: { builders: { ...settings.builders, [input.character]: { baseSet: input.set, box: input.box,
          models: { diffusion: input.models.diffusion.name, encoder: input.models.encoder.name, vae: input.models.vae.name }, ...builderRender(input) } } } });
      }
      if (live.current) setSaved(result.path);
      const references = await services.list(preview.request.character);
      if (live.current) setSources(references);
    } catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (live.current) setBusy(false); }
  };

  return <section id="so-sprite-builder" className="flex flex-col gap-3" data-box-ready={reference && !boxPending ? "true" : "false"}>
    <h3 className="text-base font-semibold">Build character sprites</h3>
    <p className="text-sm">Edit an existing transparent sprite. Choose the reference and check the head box before generating. Saving uses a separate set; the character card stays unchanged.</p>
    {!members.length && <p role="status">Add this story’s cast in the Roster tab, and install their character cards first.</p>}
    <label>Character<select aria-label="Character" className="text_pole" disabled={busy} value={character} onChange={(event) => setCharacter(event.target.value)}>
      <option value="">Choose a character</option>{members.map((member) => <option key={member.folder} value={member.folder}>{member.name}</option>)}</select></label>
    <label>Output set<input className="text_pole" disabled={busy} value={set} onChange={(event) => setSet(event.target.value)} pattern="[a-z0-9_]+" /></label>
    <label>Reference sprite<select aria-label="Reference sprite" className="text_pole" disabled={busy} value={reference} onChange={(event) => setReference(event.target.value)}>
      <option value="">Choose a reference</option>{sources.map((row) => <option key={row.path} value={row.path}>{row.label}</option>)}</select></label>
    <label>Or use a reference PNG<input type="file" accept="image/png" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0];
      if (!file || file.size > 32 * 1024 * 1024) return;
      const reader = new FileReader(); reader.onload = () => { if (live.current && typeof reader.result === "string") setReference(reader.result); }; reader.readAsDataURL(file);
    }} /></label>
    {boxPending && <p role="status">Finding the head box for this reference…</p>}
    <SpriteEditRegion reference={reference} size={size} box={box} changeBox={setBox} region={regions[reference]} busy={busy || boxPending}
      mouth={isMouthFrameKey(kind) || kind === "rest"} changeRegion={(region) => setRegions((all) => ({ ...all, [reference]: region }))} />
    <Suspense fallback={<p role="status">Loading presentation review…</p>}><PreparePresentation key={character} character={character}
      card={members.find((member) => member.folder === character)?.image} reference={reference} box={box} busy={busy || boxPending} setBusy={setBusy} /></Suspense>
    {character && <Suspense fallback={<p role="status">Loading changed looks…</p>}><ChangedLookRebuild key={`looks:${character}`} character={character}
      member={rosterIdOf(draft.roster ?? [], members, character)} name={members.find((member) => member.folder === character)?.name ?? character} busy={busy} setBusy={setBusy} /></Suspense>}
    <PresentationRoutes />
    <Button type="button" disabled={busy} onClick={() => void discover()}>Discover image-edit setup</Button>
    {discovery && <fieldset className="flex flex-col gap-2"><legend>Installed models — {EDIT_RECIPE.id}</legend>
      {(["diffusion", "encoder", "vae"] as const).map((field) => <label key={field}>{field}<select aria-label={field} className="text_pole" disabled={busy} value={models[field]}
        onChange={(event) => setModels({ ...models, [field]: event.target.value })}>
        <option value="">Choose a model</option>{discovery[field === "diffusion" ? "diffusionModels" : field === "encoder" ? "textEncoders" : "vaes"].map((name) =>
          <option key={name}>{name}</option>)}</select></label>)}
    </fieldset>}
    {discovery && <ReferencePackPicker key={`reference:${character}`} character={character} discovery={discovery} models={models}
      box={box} steps={steps} resolution={resolution} busy={busy || boxPending} setBusy={setBusy} services={services} />}
    {discovery && <BaseSpriteBuilder key={`base:${character}`} character={character} image={members.find((member) => member.folder === character)?.image}
      set={set} models={models} discovery={discovery} steps={steps} resolution={resolution} seed={seed} busy={busy} setBusy={setBusy} builder={builder} services={services}
      onSaved={(path) => { setReference(path); void services.list(character).then((rows) => { if (live.current) setSources(rows); }); }} />}
    <label>Edit<select aria-label="Edit" className="text_pole" disabled={busy} value={kind} onChange={(event) => setKind(event.target.value as EditKind)}>
      <option value="expression">Expression</option><option value="rest">Closed-mouth neutral rest</option>
      <option value="blink">Blink frame</option><option value="talk">Mouth open frame</option>
      <option value="talk2">Mouth half-open frame</option><option value="mouth_o">Mouth rounded frame (oh)</option>
      <option value="mouth_wide">Mouth wide frame (ee)</option><option value="look">Changed look</option></select></label>
    <label>Expression label<input className="text_pole" disabled={busy} list="so-sprite-labels" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
    <datalist id="so-sprite-labels">{EXPRESSIONS.map((name) => <option key={name} value={name} />)}</datalist>
    {kind === "look" && <label>Visible change<input className="text_pole" value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} placeholder="hair dyed red" /></label>}
    <label>Seed<input type="number" min={0} max={4294967295} className="text_pole" disabled={busy} value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
    <SpriteRenderControls controls={render} busy={busy} />
    <div className="flex flex-wrap gap-2"><Button variant="primary" type="button"
      disabled={busy || boxPending || !discovery || !reference || !character || !/^[a-z0-9_]+$/.test(set) || !/^[a-z0-9_]+$/.test(label)}
      onClick={() => void generate()}>Generate preview</Button>
      <Button type="button" disabled={!busy} onClick={() => builder.cancel()}>Cancel render</Button></div>
    {busy && <p role="status">Working on the sprite…</p>}
    {error && <p role="alert">{error}</p>}
    {repair && <Button id="so-sprite-use-own-box" type="button" disabled={busy} onClick={adoptOwnBox}>
      Use {members.find((member) => member.folder === character)?.name ?? character}’s head box</Button>}
    {preview && <SpritePreview candidate={preview} busy={busy} saved={Boolean(saved)} keep={() => void save()} />}
    {saved && <p role="status">Saved to {saved}</p>}
    <Suspense fallback={<p role="status">Loading poses…</p>}><PosesList /></Suspense>
    <GeneratedSpriteSets key={character} character={character} busy={busy} list={services.sets} remove={services.delete} />
  </section>;
}

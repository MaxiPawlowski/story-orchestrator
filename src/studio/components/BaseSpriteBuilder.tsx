import React, { useEffect, useRef, useState } from "react";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import type { ComfyDiscovery } from "@services/stHost/media";
import { recipeProblems } from "../../sprites/builder/recipes";
import type { SpriteBuilder as Builder, SpriteCandidate } from "../../sprites/builder/builder";
import type { SpriteBuilderHost } from "./SpriteBuilder";
import { draftOwnership } from "../agentHost";
import { builderRender, RENDER_PRESETS } from "../../sprites/settings";
import { refuseDefaultCardArt } from "../../sprites/cardArt";
import { faceAnchor, headBox } from "../../sprites/builder/headBox";

export const BASE_ATTEMPTS = 4;

export default function BaseSpriteBuilder({ character, image, set, models, discovery, steps, resolution = RENDER_PRESETS.standard.resolution, seed, busy, setBusy, builder, services, onSaved }: {
  character: string; image?: string; set: string; models: { diffusion: string; encoder: string; vae: string };
  discovery: ComfyDiscovery; steps: number; resolution?: number; seed: number; busy: boolean; setBusy(value: boolean): void;
  builder: Pick<Builder, "build" | "save" | "cancel" | "close">; services: SpriteBuilderHost;
  onSaved?(path: string): void;
}) {
  const [alpha, setAlpha] = useState(discovery.alpha?.[0]?.id ?? "");
  const [candidates, setCandidates] = useState<SpriteCandidate[]>([]);
  const tried = useRef(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const live = useRef(true);
  const cancelled = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const build = async (another = false) => {
    const cutout = discovery.alpha?.find((recipe) => recipe.id === alpha);
    if (!image || !cutout) return;
    cancelled.current = false;
    if (!another) { tried.current = 0; setCandidates([]); setSaved(null); }
    setBusy(true); setErrors([]);
    try {
      const problems = recipeProblems(discovery, models);
      if (problems.length) throw new Error(problems.join(" "));
      await refuseDefaultCardArt(await services.decode(image), services.decode);
      const [diffusion, encoder, vae] = await Promise.all([
        services.fingerprint("diffusionModels", models.diffusion, AbortSignal.timeout(600_000)),
        services.fingerprint("textEncoders", models.encoder, AbortSignal.timeout(600_000)),
        services.fingerprint("vaes", models.vae, AbortSignal.timeout(600_000)),
      ]);
      for (let attempt = 0; attempt < BASE_ATTEMPTS && live.current && !cancelled.current; attempt += 1) {
        const at = tried.current++;
        try {
          const candidate = await builder.build({ character, set, label: "neutral", kind: "base", value: "neutral standing sprite",
            reference: image, box: { x: 0, y: 0, width: 8, height: 8 }, models: { diffusion, encoder, vae }, cutout, seed: (seed + at) >>> 0, steps, resolution });
          if (live.current) setCandidates((rows) => [...rows, candidate]);
          break;
        } catch (error) {
          if (live.current) setErrors((rows) => [...rows, `Candidate ${at + 1}: ${String(error)}`]);
          if (error instanceof Error && (error.name === "AbortError" || error.message.includes("draft changed"))) break;
        }
      }
    } catch (error) { if (live.current) setErrors([String(error)]); }
    finally { setBusy(false); }
  };

  const keep = async (candidate: SpriteCandidate) => {
    const run = draftOwnership.mint();
    setBusy(true); setErrors([]);
    try {
      const result = await builder.save(candidate);
      if (!live.current) return;
      const input = candidate.request;
      const neutral = await services.decode(`data:image/png;base64,${candidate.data}`);
      const face = services.detect ? faceAnchor(await services.detect(candidate.data).catch(() => null), neutral) : null;
      if (!live.current || !draftOwnership.check(run).ok) return;
      const settings = getGlobalSettings().sprites;
      setGlobalSettings({ sprites: { builders: { ...settings.builders, [input.character]: { baseSet: input.set,
        box: headBox(neutral, face),
        models: { diffusion: input.models.diffusion.name, encoder: input.models.encoder.name, vae: input.models.vae.name }, ...builderRender(input) } } } });
      setSaved(result.path);
      onSaved?.(result.path);
    } catch (error) { if (live.current) setErrors([String(error)]); }
    finally { setBusy(false); }
  };

  return <details id="so-sprite-base"><summary>Build a base from character-card art</summary>
    <p className="text-sm">Make one neutral candidate with a transparent background; the next seed is tried only when a candidate fails its checks
      (up to {BASE_ATTEMPTS}). Make another to compare, keep one, then build its expressions. The card and existing packs stay unchanged.</p>
    {!image && <p role="status">Install this character card before building its base.</p>}
    {!discovery.alpha?.length && <p role="status">Configure an installed background-removal model in the media plugin. This builder downloads no models.</p>}
    {image && <img src={image} alt="Character-card reference" style={{ maxWidth: "min(180px,100%)" }} />}
    <label>Background removal<select aria-label="Background removal" className="text_pole" value={alpha} disabled={busy}
      onChange={(event) => setAlpha(event.target.value)}>
      {(discovery.alpha ?? []).map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.model}</option>)}</select></label>
    <button id="so-sprite-build-base" type="button" className="st-button" disabled={busy || !image || !alpha || !/^[a-z0-9_]{1,80}$/.test(set)}
      onClick={() => void build()}>Build a base candidate</button>
    {candidates.length > 0 && !saved && <button type="button" className="st-button" disabled={busy} onClick={() => void build(true)}>Make another candidate</button>}
    <button type="button" className="st-button" disabled={!busy} onClick={() => { cancelled.current = true; builder.cancel(); }}>Cancel base render</button>
    {errors.map((error, at) => <p role="alert" key={at}>{error}</p>)}
    <div className="flex flex-wrap gap-2">{candidates.map((candidate, at) => <div key={candidate.key}>
      <img src={`data:image/png;base64,${candidate.data}`} alt={`Base candidate ${at + 1}`} style={{ maxWidth: "min(180px,100%)" }} />
      <p>{candidate.seconds.toFixed(1)} seconds · transparency checks passed</p>
      <button type="button" className="st-button" disabled={busy || Boolean(saved)} onClick={() => void keep(candidate)}>Keep base {at + 1}</button>
    </div>)}</div>
    {saved && <p role="status">Saved neutral base to {saved}. Adjust its head box and review presentation above.</p>}
  </details>;
}

import React, { useEffect, useRef, useState } from "react";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import { referenceProblems } from "../../sprites/builder/referencePack";
import { recipeProblems } from "../../sprites/builder/recipes";
import type { HeadBox } from "../../sprites/builder/pixels";
import type { ComfyDiscovery } from "@services/stHost/media";
import type { SpriteBuilderHost } from "./SpriteBuilder";
import { draftOwnership } from "../agentHost";

export default function ReferencePackPicker({ character, discovery, models, box, steps, busy, setBusy, services }: {
  character: string; discovery: ComfyDiscovery; models: { diffusion: string; encoder: string; vae: string };
  box: HeadBox; steps: number; busy: boolean; setBusy(value: boolean): void; services: SpriteBuilderHost;
}) {
  const [packs, setPacks] = useState<string[]>([]);
  const [pack, setPack] = useState("");
  const [adopted, setAdopted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    if (character) void services.referenceSets(character).then((found) => { if (live.current) setPacks(found); })
      .catch((reason) => { if (live.current) setError(String(reason)); });
    return () => { live.current = false; };
  }, [character, services]);

  const adopt = async () => {
    const run = draftOwnership.mint();
    setBusy(true); setError(null); setAdopted(null);
    try {
      const problems = recipeProblems(discovery, models);
      if (problems.length) throw new Error(problems.join(" "));
      const before = await services.referencePack(character, pack);
      if (!before.files.some((file) => file.label === "neutral")) throw new Error("Choose an expression pack with a neutral reference.");
      for (const file of before.files) {
        const image = await services.decode(file.path);
        const reasons = referenceProblems(image);
        if (image.sha256 !== file.sha256) reasons.push("The image changed while the pack was checked.");
        if (reasons.length) throw new Error(`${file.label}: ${reasons.join(" ")}`);
      }
      const after = await services.referencePack(character, pack);
      if (after.sha256 !== before.sha256) throw new Error("The expression pack changed. Check it again before using it.");
      if (!live.current || !draftOwnership.check(run).ok) return;
      const settings = getGlobalSettings().sprites;
      setGlobalSettings({ sprites: { builders: { ...settings.builders, [character]: { baseSet: pack, box, models, steps } } } });
      setAdopted(`Using ${pack || "the default pack"}: ${before.files.length} expressions. Original images stay protected.`);
    } catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  return <fieldset className="flex flex-col gap-2"><legend>Existing expressions for changed looks</legend>
    <p className="text-sm">Reuse these expressions without rebuilding them. Each changed look is saved separately; original images are never adopted as generated files.</p>
    <label>Reference pack<select id="so-sprite-reference-pack" aria-label="Reference pack" className="text_pole" disabled={busy} value={pack}
      onChange={(event) => { setPack(event.target.value); setAdopted(null); }}>
      {packs.map((id) => <option key={id} value={id}>{id || "Default expressions"}</option>)}</select></label>
    <button id="so-sprite-use-reference" type="button" className="st-button" style={{ transitionProperty: "background-color,border-color,color" }}
      disabled={busy || !character || !packs.includes(pack)}
      onClick={() => void adopt()}>Use this expression pack</button>
    {adopted && <p role="status">{adopted}</p>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}

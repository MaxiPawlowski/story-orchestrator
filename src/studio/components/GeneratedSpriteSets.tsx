import React, { useState } from "react";
import { showConfirmPopup } from "@services/STAPI";
import type { SpriteManifest, generatedSpriteSets, deleteGeneratedSprite } from "@services/stHost/media";

export default function GeneratedSpriteSets({ character, busy, list, remove }: {
  character: string; busy: boolean; list: typeof generatedSpriteSets; remove: typeof deleteGeneratedSprite;
}) {
  const [sets, setSets] = useState<SpriteManifest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { void list(character).then(setSets).catch((error) => setError(String(error))); };
  const erase = async (manifest: SpriteManifest, label: string) => {
    if (!(await showConfirmPopup(`Remove the generated sprite ${label} from ${manifest.set}?`, { okButton: "Remove", cancelButton: "Keep" }))) return;
    const result = await remove(manifest.character, manifest.set, label, manifest.labels[label].sha256);
    if (!result.ok) { setError(result.reason); return; }
    setSets(await list(character));
  };
  return <details><summary>Generated sets for this character</summary>
    <button type="button" className="st-button" disabled={busy || !character} onClick={refresh}>Refresh generated sets</button>
    {error && <p role="alert">{error}</p>}
    {sets.map((manifest) => <fieldset key={manifest.set}><legend>{manifest.set}</legend>
      {Object.keys(manifest.labels).map((label) => <div key={label} className="flex gap-2">
        <span>{label}</span><button type="button" className="st-button" disabled={busy}
          onClick={() => { void erase(manifest, label).catch((error) => setError(String(error))); }}>Remove generated sprite</button>
      </div>)}
    </fieldset>)}
  </details>;
}

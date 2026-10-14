import React, { useEffect, useMemo, useRef, useState } from "react";
import { getGlobalSettings } from "@runtime/settingsStore";
import { spriteManifest, spriteFileFingerprint } from "@services/stHost/media";
import { draftOwnership } from "../agentHost";
import type { HeadBox } from "../../sprites/builder/pixels";
import { createVisualPreparation } from "../../sprites/visualHost";
import { subscribeVisualSources } from "../../sprites/visualChanges";
import type { VisualReview } from "../../sprites/visualPreparation";
import PresentationReview from "./PresentationReview";
import ReferencePackStep from "./ReferencePackStep";
import { beginRun } from "@runtime/runToken";

export default function PreparePresentation({ character, card, reference, box, busy, setBusy }: {
  character: string; card?: string; reference: string; box: HeadBox; busy: boolean; setBusy(value: boolean): void;
}) {
  const preparation = useMemo(() => createVisualPreparation(draftOwnership), []);
  const [review, setReview] = useState<VisualReview | null>(null), [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(getGlobalSettings().sprites.visualSources[character]);
  const generation = useRef(0);
  useEffect(() => subscribeVisualSources(() => setAccepted(getGlobalSettings().sprites.visualSources[character])), [character]);
  const cancel = () => { generation.current += 1; preparation.cancel(); setReview(null); };
  useEffect(() => { generation.current += 1; preparation.cancel(); setReview(null); setError(null); setAccepted(getGlobalSettings().sprites.visualSources[character]);
    return () => { generation.current += 1; preparation.cancel(); }; }, [character, card, reference, box.x, box.y, box.width, box.height, preparation]);
  const prepare = async () => {
    const version = ++generation.current, run = beginRun(draftOwnership);
    const current = () => version === generation.current && run.stillOwns();
    const guard = () => { if (!current()) throw new Error("The card or draft changed. Review presentation again."); };
    setBusy(true); setError(null);
    try {
      if (!card || !reference.startsWith("/characters/")) throw new Error("Choose an installed generated neutral base before reviewing presentation.");
      const settings = getGlobalSettings().sprites, config = settings.builders[character];
      if (!config) throw new Error("Keep a base candidate or choose its reference pack first.");
      const manifest = await spriteManifest(character, config.baseSet);
      guard();
      const row = manifest?.labels.neutral;
      if (!row || row.status !== "complete") throw new Error("This generated set has no complete neutral base.");
      const hash = await spriteFileFingerprint(reference, run.signal);
      guard();
      if (row.sha256 !== hash) throw new Error("Select this set's neutral base, not an expression or another candidate.");
      const cardHash = await spriteFileFingerprint(card, run.signal);
      guard();
      const result = await preparation.prepare({ character, card: { path: card, sha256: cardHash }, baseSet: config.baseSet,
        base: { path: reference, sha256: hash, key: row.key, recipe: row.recipe }, box });
      guard(); setReview(result);
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { run.release(); setBusy(false); }
  };
  const accept = async () => {
    if (!review) return;
    const version = generation.current;
    setBusy(true); setError(null);
    try { const source = await preparation.accept(review); if (version === generation.current) { setAccepted(source); setReview(null); } }
    catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <><PresentationReview review={review} accepted={accepted} busy={busy} error={error}
    prepare={() => void prepare()} accept={() => void accept()} cancel={cancel} />
    {character && <ReferencePackStep key={`pack:${character}:${accepted?.revision ?? 0}`} character={character} busy={busy} setBusy={setBusy} />}</>;
}

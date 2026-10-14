import React, { useEffect, useMemo, useRef, useState } from "react";
import { getGlobalSettings } from "@runtime/settingsStore";
import { draftOwnership } from "../agentHost";
import { createReferencePackSession } from "../../sprites/referenceViewsHost";
import { subscribeVisualSources } from "../../sprites/visualChanges";
import type { ReferencePackReview as Review } from "../../sprites/referenceViews";
import ReferencePackReview from "./ReferencePackReview";

export default function ReferencePackStep({ character, busy, setBusy }: { character: string; busy: boolean; setBusy(value: boolean): void }) {
  const session = useMemo(() => createReferencePackSession(draftOwnership), []);
  const [source, setSource] = useState(() => getGlobalSettings().sprites.visualSources[character]);
  const [review, setReview] = useState<Review | null>(null), [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const generation = useRef(0);
  useEffect(() => subscribeVisualSources(() => setSource(getGlobalSettings().sprites.visualSources[character])), [character]);
  useEffect(() => () => { generation.current += 1; session.cancel(); }, [session]);
  const cancel = () => { generation.current += 1; session.cancel(); setReview(null); setProgress(null); };
  const prepare = async () => {
    const version = ++generation.current;
    setBusy(true); setError(null); setReview(null);
    try {
      const result = await session.prepare(character, (done, total) => { if (version === generation.current) setProgress({ done, total }); });
      if (version === generation.current) setReview(result);
    } catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (version === generation.current) setProgress(null); setBusy(false); }
  };
  const accept = async () => {
    if (!review) return;
    const version = generation.current;
    setBusy(true); setError(null);
    try { const next = await session.accept(review); if (version === generation.current) { setSource(next); setReview(null); } }
    catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <ReferencePackReview source={source} review={review} busy={busy} progress={progress} error={error}
    prepare={() => void prepare()} accept={() => void accept()} cancel={cancel} />;
}

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGlobalSettings } from "@runtime/settingsStore";
import { beginRun } from "@runtime/runToken";
import { draftOwnership } from "../agentHost";
import { createLookRebuild } from "../../sprites/lookRebuildHost";
import { changedLookRows, type LookRebuildReview } from "../../sprites/lookRebuild";
import { subscribeVisualSources } from "../../sprites/visualChanges";
import ChangedLookReview from "./ChangedLookReview";

const RigPreview = lazy(() => import("../../sprites/liveHead/RigPreview"));
const rowsFor = (character: string, member: string) => {
  const settings = getGlobalSettings().sprites;
  return changedLookRows(settings.visualSources[character], member, settings.liveHeadRigs);
};

export default function ChangedLookRebuild({ character, member, name, busy, setBusy }: {
  character: string; member: string; name: string; busy: boolean; setBusy(value: boolean): void;
}) {
  const rebuilder = useMemo(() => createLookRebuild(draftOwnership), []);
  const [rows, setRows] = useState(() => rowsFor(character, member));
  const [review, setReview] = useState<LookRebuildReview | null>(null), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const beginPreview = useCallback(() => beginRun(draftOwnership), []);
  useEffect(() => {
    generation.current += 1; rebuilder.cancel(); setReview(null); setError(null); setNotice(null); setRows(rowsFor(character, member));
    const off = subscribeVisualSources(() => setRows(rowsFor(character, member)));
    return () => { off(); generation.current += 1; rebuilder.cancel(); };
  }, [character, member, rebuilder]);
  const cancel = () => { generation.current += 1; rebuilder.cancel(); setReview(null); setBusy(false); };
  const rebuild = async (look: string) => {
    const version = ++generation.current;
    setBusy(true); setError(null); setNotice(null); setReview(null);
    try { const result = await rebuilder.prepare({ character, member, look }); if (version === generation.current) setReview(result); }
    catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (version === generation.current) setBusy(false); }
  };
  const accept = async () => {
    if (!review) return;
    const version = generation.current;
    setBusy(true); setError(null);
    try {
      const result = await rebuilder.accept(review);
      if (version === generation.current) { setReview(null); setRows(rowsFor(character, member));
        setNotice(result.rig ? `Bust and rig accepted for ${review.target.look}. Close shots animate again.` : `Bust accepted for ${review.target.look}; the rig is still pending.`); }
    } catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <ChangedLookReview rows={rows} review={review} busy={busy} error={error} notice={notice}
    rebuild={(look) => void rebuild(look)} accept={() => void accept()} cancel={cancel}
    preview={review?.rig ? <Suspense fallback={<p role="status">Loading rig preview…</p>}>
      <RigPreview manifest={review.rig} name={name} beginRun={beginPreview} /></Suspense> : null} />;
}

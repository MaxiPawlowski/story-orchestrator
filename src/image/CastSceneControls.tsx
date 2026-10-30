import React, { useState } from "react";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import type { ImageQueue } from "./queue";
import { spriteCast } from "@services/stHost/sprites";
import { PLAYER_COPY } from "@runtime/narrative";
import { log } from "@utils/log";
import { Button } from "@components/ui/Button";

export default function CastSceneControls({ manager, snapshot, queue, members, render }: {
  manager: RuntimeManager; snapshot: RuntimeSnapshot; queue: ImageQueue;
  members?: Array<{ name: string; folder: string }>; render?(selected: string[], direction: string): Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]), [direction, setDirection] = useState(""), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cast = members ?? (snapshot.storyId ? spriteCast().members.filter((member) => !member.muted) : []);
  const draw = async () => {
    setBusy(true); setError(null);
    try {
      if (render) await render(selected, direction);
      else await (await import("./castSceneHost")).drawPreparedCast(manager, queue, selected, direction);
    }
    catch (reason) {
      log.warn("prepared cast illustration refused", reason);
      const gap = reason instanceof Error && reason.name === "CastSetupGap" ? reason as Error & { player?: string } : null;
      setError(gap ? (snapshot.ui?.authorView ? gap.message : gap.player ?? PLAYER_COPY.castSetup) : PLAYER_COPY.imageError);
    }
    finally { setBusy(false); }
  };
  return <details id="so-cast-scene"><summary>Illustrate prepared cast</summary><div className="flex flex-col gap-2">
    <p>Select up to two characters. Uses accepted current-look identities with Qwen 2.1. Prepare presentation in Studio first.</p>
    {cast.map((member) => <label key={member.folder}><input type="checkbox"
      disabled={busy || (!selected.includes(member.folder) && selected.length === 2)}
      checked={selected.includes(member.folder)} onChange={(event) => setSelected((rows) => event.target.checked
        ? [...rows, member.folder] : rows.filter((row) => row !== member.folder))} />{member.name}</label>)}
    <label>Scene direction<input className="text_pole" value={direction} disabled={busy} onChange={(event) => setDirection(event.target.value)} /></label>
    <Button type="button" disabled={busy || !selected.length} onClick={() => void draw()}>Draw current-look cast</Button>
    {busy && <Button type="button" onClick={() => queue.cancelAll()}>Cancel cast illustration</Button>}
    {error && <p role="alert">{error}</p>}
  </div></details>;
}

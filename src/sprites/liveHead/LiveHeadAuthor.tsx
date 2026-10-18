import React, { useState } from "react";
import type { LiveHeadRef } from "../liveHeadRefs";
import { liveHeadKey } from "../liveHeadRefs";
import { loadHeadManifest, manifestRef } from "./manifest";
import { mouthRegionProblem } from "./meshMouth";
import { motionSummary } from "./motionSummary";

export interface HeadStatus { member: string; name: string; look: string; present: boolean; state?: "missing-source" | "pending-bust" | "pending-rig" | "ready" }
export function LiveHeadAuthor({ rows, onImport }: { rows: HeadStatus[]; onImport(ref: LiveHeadRef): void }) {
  const [text, setText] = useState(""), [notice, setNotice] = useState("");
  const install = () => {
    try {
      if (text.length > 24_000_000) throw new Error("Rig package is too large.");
      const manifest = loadHeadManifest(JSON.parse(text));
      if (!rows.some((row) => row.member === manifest.member && row.look === manifest.look)) throw new Error("Choose this member's look before importing its rig.");
      const ref = manifestRef(manifest);
      if (ref.manifest.length > 24_000_000) throw new Error("Rig package is too large.");
      const still = mouthRegionProblem(manifest.rig);
      onImport(ref); setNotice(`Rig imported for ${manifest.member}, ${manifest.look}. ${motionSummary(manifest)}${still ? ` ${still} Its mouth stays still.` : ""}`); setText("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Invalid rig package."); }
  };
  return <div id="so-live-head-author" className="flex flex-col gap-1 text-xs">
    {rows.map((row) => <div key={liveHeadKey({ ...row, artHash: "" })} data-so="head-rig-status">
      {row.name} ({row.look}): {row.present ? "rig present" : row.state === "pending-bust" ? "changed-look bust and rig pending; static fallback"
        : row.state === "missing-source" ? "source lineage missing; static fallback" : "rig missing; static fallback"}
    </div>)}
    <details><summary>Import a live head rig</summary>
      <label htmlFor="so-live-head-json">Rig package JSON</label>
      <textarea id="so-live-head-json" value={text} onChange={(event) => setText(event.target.value)} rows={3} />
      <button type="button" className="menu_button" disabled={!text.trim()} onClick={install}>Import rig</button>
    </details>
    {notice && <span role="status">{notice}</span>}
  </div>;
}

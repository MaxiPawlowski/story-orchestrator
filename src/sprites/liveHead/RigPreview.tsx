import React, { useMemo, useState } from "react";
import type { RunGuard } from "@runtime/runToken";
import { StreamActivity } from "../animation";
import { LiveHead } from "./LiveHead";
import { manifestRef, type HeadManifest } from "./manifest";
import { mouthRegionProblem } from "./meshMouth";

export default function RigPreview({ manifest, name, beginRun, width = 180 }: { manifest: HeadManifest; name: string; beginRun(): RunGuard; width?: number }) {
  const [activity] = useState(() => new StreamActivity());
  const [label, setLabel] = useState("neutral");
  const binding = useMemo(() => manifestRef(manifest), [manifest]);
  const still = useMemo(() => mouthRegionProblem(manifest.rig), [manifest]);
  return <figure data-so="rig-preview" className="flex flex-col gap-1">
    <div style={{ position: "relative", width, aspectRatio: `${manifest.rig.image.width} / ${manifest.rig.image.height}` }}>
      <img src={manifest.source} alt={`${name} bust under the rig`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      <LiveHead binding={binding} name={name} label={label} activity={activity} motion breathing blink mouth beginRun={beginRun}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
    <figcaption className="flex flex-wrap gap-1 items-center">
      <label>Preview expression <select className="text_pole" value={label} onChange={(event) => setLabel(event.target.value)}>
        <option>neutral</option><option>joy</option><option>anger</option><option>surprise</option></select></label>
      <button type="button" className="menu_button" onClick={() => activity.pulse(name)}>Preview talking</button>
      {still && <span data-so="rig-mouth-note">{still} Its mouth stays still.</span>}
    </figcaption>
  </figure>;
}

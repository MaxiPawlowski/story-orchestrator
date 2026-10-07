import React from "react";
import type { HeadBox } from "../../sprites/builder/pixels";
import { mouthRegion, type FrameRegion } from "../../sprites/builder/frameRegion";

export default function SpriteEditRegion({ reference, size, box, changeBox, region, changeRegion, mouth, busy }: {
  reference: string; size: { width: number; height: number }; box: HeadBox; changeBox(box: HeadBox): void;
  region?: FrameRegion; changeRegion(region: FrameRegion | undefined): void; mouth: boolean; busy: boolean;
}) {
  const effective = region ?? mouthRegion(box);
  const rectangle = (part: HeadBox, colour: string) => ({ position: "absolute" as const, border: `2px solid ${colour}`, pointerEvents: "none" as const,
    left: `${part.x / size.width * 100}%`, top: `${part.y / size.height * 100}%`, width: `${part.width / size.width * 100}%`, height: `${part.height / size.height * 100}%` });
  return <>
    {reference && <div className="relative" style={{ width: "min(280px,100%)" }}>
      <img src={reference} alt="Selected reference" style={{ display: "block", width: "100%" }} />
      <div aria-hidden="true" style={rectangle(box, "#f66")} />
      {mouth && <div aria-hidden="true" style={rectangle({ ...effective, x: box.x + effective.x, y: box.y + effective.y }, "#6f6")} />}
    </div>}
    <fieldset className="flex flex-wrap gap-2"><legend>Head box, in reference pixels</legend>{(["x", "y", "width", "height"] as const).map((field) =>
      <label key={field}>{field}<input className="text_pole" type="number" min={0} disabled={busy} value={box[field]}
        onChange={(event) => changeBox({ ...box, [field]: Number(event.target.value) })} /></label>)}</fieldset>
    {mouth && <details id="so-sprite-mouth-region"><summary>Mouth replacement region</summary>
      <p className="text-sm">Green is the mouth patch. Keep both lip lines and corners inside its opaque middle; feather only the surrounding skin. Coordinates are relative to the red head box.</p>
      <fieldset className="flex flex-wrap gap-2"><legend>Mouth patch</legend>{(["x", "y", "width", "height", "feather"] as const).map((field) =>
        <label key={field}>Mouth {field}<input aria-label={`Mouth ${field}`} className="text_pole" type="number" min={0} disabled={busy} value={effective[field]}
          onChange={(event) => changeRegion({ ...effective, [field]: Number(event.target.value) })} /></label>)}</fieldset>
      <button type="button" className="st-button" disabled={busy} onClick={() => changeRegion(undefined)}>Reset mouth region</button>
    </details>}
  </>;
}

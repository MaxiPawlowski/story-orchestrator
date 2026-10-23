import React, { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { RunGuard } from "@runtime/runToken";
import { StreamActivity } from "../animation";
import { LiveHead } from "./LiveHead";
import { syntheticHead, syntheticRef } from "./synthetic";
import type { ExpressionSources } from "./expressions";
import "../styles.css";

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
function Preview() {
  const [activity] = useState(() => new StreamActivity());
  const [motion, setMotion] = useState(true), [label, setLabel] = useState("neutral");
  return <div style={{ pointerEvents: "auto" }}>
    <label>Expression <select value={label} onChange={(event) => setLabel(event.target.value)}>
      <option>neutral</option><option>joy</option><option>anger</option><option>sadness</option><option>surprise</option>
    </select></label>
    <label><input type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} />Motion</label>
    <button type="button" className="menu_button" onClick={() => activity.pulse("Shape")}>Stream reply</button>
    <button type="button" className="menu_button" onClick={() => activity.stop()}>Stop reply</button>
    <div id="so-vn-root" style={{ position: "relative", width: "100%", maxWidth: 360, height: 420 }}>
      <div className="so-sprite" style={{ width: "100%", left: "50%" }}><div className="so-sprite-breath">
        <img src={syntheticHead.source} alt="Synthetic shape bust" />
        <LiveHead binding={syntheticRef} name="Shape" label={label} activity={activity} motion={motion} breathing blink mouth beginRun={owner} />
      </div></div>
    </div>
  </div>;
}
function smileArt(): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas"), rig = syntheticHead.rig;
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) { reject(new Error("No 2D canvas.")); return; }
      context.drawImage(image, 0, 0);
      context.fillStyle = "rgb(150, 40, 60)";
      context.beginPath(); context.ellipse(rig.mouth.cx, rig.mouth.cy + 2, rig.mouth.halfLen * 1.1, 3, 0, 0, Math.PI); context.fill();
      context.fillStyle = "rgba(230, 110, 120, 0.5)";
      for (const [x, y] of rig.cheeks) { context.beginPath(); context.ellipse(x, y, 6, 3, 0, 0, Math.PI * 2); context.fill(); }
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Synthetic bust did not decode."));
    image.src = syntheticHead.source;
  });
}

function TexturePreview() {
  const [activity] = useState(() => new StreamActivity());
  const [label, setLabel] = useState("neutral"), [expressions, setExpressions] = useState<ExpressionSources | undefined>();
  useEffect(() => { void smileArt().then((art) => setExpressions({ looks: { happy: { art, frames: {} } } })); }, []);
  return <div style={{ pointerEvents: "auto" }}>
    <label>Expression <select value={label} onChange={(event) => setLabel(event.target.value)}>
      <option>neutral</option><option>joy</option><option>anger</option>
    </select></label>
    <div id="so-vn-root" style={{ position: "relative", width: "100%", maxWidth: 360, height: 420 }}>
      <div className="so-sprite" style={{ width: "100%", left: "50%" }}><div className="so-sprite-breath">
        <img src={syntheticHead.source} alt="Synthetic shape bust with a smile texture" />
        {expressions && <LiveHead binding={syntheticRef} name="Shape" label={label} activity={activity} motion breathing blink mouth beginRun={owner} expressions={expressions} />}
      </div></div>
    </div>
  </div>;
}

const meta: Meta<typeof LiveHead> = { title: "Sprites/LiveHead", component: LiveHead, render: () => <Preview />,
  parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj<typeof LiveHead>;
export const SyntheticBust: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByAltText("Synthetic shape bust")).toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Expression" }), "joy");
    await userEvent.click(canvas.getByRole("button", { name: "Stream reply" }));
    await userEvent.click(canvas.getByRole("button", { name: "Stop reply" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Motion" }));
    await expect(canvas.getByRole("checkbox", { name: "Motion" })).not.toBeChecked();
    await expect(canvasElement.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
  },
};
export const ExpressionTexture: Story = {
  render: () => <TexturePreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByAltText("Synthetic shape bust with a smile texture")).toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Expression" }), "joy");
    await expect(canvas.getByRole("combobox", { name: "Expression" })).toHaveValue("joy");
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Expression" }), "anger");
    await expect(canvas.getByRole("combobox", { name: "Expression" })).toHaveValue("anger");
  },
};

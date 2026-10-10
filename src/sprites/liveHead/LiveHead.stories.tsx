import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { RunGuard } from "@runtime/runToken";
import { StreamActivity } from "../animation";
import { LiveHead } from "./LiveHead";
import { syntheticHead, syntheticRef } from "./synthetic";
import "../styles.css";

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
function Preview() {
  const [activity] = useState(() => new StreamActivity());
  const [motion, setMotion] = useState(true), [label, setLabel] = useState("neutral");
  return <div>
    <label>Expression <select value={label} onChange={(event) => setLabel(event.target.value)}>
      <option>neutral</option><option>joy</option><option>anger</option><option>sadness</option><option>surprise</option>
    </select></label>
    <label><input type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} />Motion</label>
    <button type="button" onClick={() => activity.pulse("Shape")}>Stream reply</button>
    <button type="button" onClick={() => activity.stop()}>Stop reply</button>
    <div id="so-vn-root" style={{ position: "relative", width: "100%", maxWidth: 360, height: 420 }}>
      <div className="so-sprite" style={{ width: "100%", left: "50%" }}><div className="so-sprite-breath">
        <img src={syntheticHead.source} alt="Synthetic shape bust" />
        <LiveHead binding={syntheticRef} name="Shape" label={label} activity={activity} motion={motion} breathing blink mouth beginRun={owner} />
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

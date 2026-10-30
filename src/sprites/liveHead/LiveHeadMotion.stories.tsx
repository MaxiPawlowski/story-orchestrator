import React, { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import type { RunGuard } from "@runtime/runToken";
import { StreamActivity } from "../animation";
import { restHead, type HeadParameters } from "./drivers";
import { headImage } from "./load";
import { LiveHead } from "./LiveHead";
import { HeadRenderer } from "./renderer";
import { syntheticMotionHead, syntheticMotionRef } from "./synthetic";
import { motionSummary } from "./motionSummary";
import "../styles.css";

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });

function Live() {
  const [activity] = useState(() => new StreamActivity());
  const [motion, setMotion] = useState(true), [label, setLabel] = useState("neutral"), [gesture, setGesture] = useState<string>("");
  const [nonce, setNonce] = useState(0), [playing, setPlaying] = useState("");
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setPlaying(frame.current?.querySelector("canvas")?.dataset.liveHeadGesture ?? ""), 100);
    return () => clearInterval(timer);
  }, []);
  return <div style={{ pointerEvents: "auto" }}>
    <label>Expression <select value={label} onChange={(event) => setLabel(event.target.value)}>
      <option>neutral</option><option>joy</option><option>anger</option><option>sadness</option><option>surprise</option><option>curiosity</option>
    </select></label>
    <label>Gesture <select value={gesture} onChange={(event) => { setGesture(event.target.value); setNonce(nonce + 1); }}>
      <option value="">none</option><option>nod</option><option>tilt</option><option>think</option><option>giggle</option><option>shy</option>
    </select></label>
    <label><input type="checkbox" checked={motion} onChange={(event) => setMotion(event.target.checked)} />Motion</label>
    <button type="button" className="menu_button" onClick={() => activity.pulse("Shape")}>Stream reply</button>
    <button type="button" className="menu_button" onClick={() => activity.pulse("Other")}>Other member streams</button>
    <p data-so="motion-summary">{motionSummary(syntheticMotionHead)}</p>
    <p role="status">Gesture playing: {playing || "none"}</p>
    <div ref={frame} id="so-vn-root" style={{ position: "relative", width: "100%", maxWidth: 360, height: 420 }}>
      <div className="so-sprite" style={{ width: "100%", left: "50%" }}><div className="so-sprite-breath">
        <img src={syntheticMotionHead.source} alt="Synthetic shape bust with hair locks" />
        <LiveHead binding={syntheticMotionRef} name="Shape" label={label} activity={activity} motion={motion} breathing blink mouth beginRun={owner}
          gesture={gesture ? { id: gesture, nonce } : undefined} />
      </div></div>
    </div>
  </div>;
}

const POSES: Record<string, Partial<HeadParameters>> = {
  Rest: {}, "Sway left": { bodyAngleX: -8, bodyAngleZ: -8 }, "Sway right": { bodyAngleX: 8, bodyAngleZ: 8 }, "Head tilt with sway": { angleZ: 17, angleX: 8, bodyAngleZ: 3 },
};

function Poses() {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<HeadRenderer | null>(null);
  const [pose, setPose] = useState("Rest"), [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const element = canvas.current;
    if (!element) return;
    void (async () => {
      const images = await Promise.all(syntheticMotionHead.layers.map((layer) => headImage(layer.image, new AbortController().signal)));
      if (!live) return;
      const head = new HeadRenderer(element, syntheticMotionHead);
      syntheticMotionHead.layers.forEach((layer, index) => head.add(layer, images[index]));
      renderer.current = head; setReady(true);
    })();
    return () => { live = false; renderer.current?.destroy(); renderer.current = null; };
  }, []);
  useEffect(() => { if (ready) renderer.current?.draw({ ...restHead(), ...POSES[pose] }); }, [pose, ready]);
  return <div style={{ pointerEvents: "auto" }}>
    <label>Pose <select value={pose} onChange={(event) => setPose(event.target.value)}>{Object.keys(POSES).map((name) => <option key={name}>{name}</option>)}</select></label>
    <canvas ref={canvas} role="img" aria-label={`Synthetic bust: ${pose}`} style={{ width: 192, height: 288, background: "#8c8c8c", display: "block" }} />
    <span role="status">{ready ? "Renderer ready" : "Loading"}</span>
  </div>;
}

const meta: Meta<typeof LiveHead> = { title: "Sprites/LiveHeadMotion", component: LiveHead, render: () => <Live />, parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj<typeof LiveHead>;

export const GesturesAndHair: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Moves: hair (4 locks), body sway.")).toBeInTheDocument();
    await waitFor(() => expect(canvasElement.querySelector("canvas")?.style.visibility).toBe("visible"), { timeout: 10_000 });
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Expression" }), "joy");
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Gesture playing: nod"), { timeout: 5_000 });
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Gesture" }), "tilt");
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Gesture playing: tilt"), { timeout: 5_000 });
    await userEvent.click(canvas.getByRole("checkbox", { name: "Motion" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Gesture playing: none"), { timeout: 5_000 });
  },
};

export const SwayPoses: Story = {
  render: () => <Poses />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Renderer ready"), { timeout: 10_000 });
    for (const pose of Object.keys(POSES)) {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Pose" }), pose);
      await expect(canvas.getByRole("img", { name: `Synthetic bust: ${pose}` })).toBeInTheDocument();
    }
  },
};

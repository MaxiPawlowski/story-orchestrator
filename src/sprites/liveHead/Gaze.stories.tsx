import React, { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import type { PixelImage } from "../builder/pixels";
import { restHead } from "./drivers";
import { gazeOffset, renderOpenBall, scleraTone, type GazeMode } from "./gaze";
import { headImage } from "./load";
import { HeadRenderer } from "./renderer";
import { syntheticHead } from "./synthetic";
import { syntheticBust } from "./synthesis/syntheticBust";
import { synthesizeRig } from "./synthesis/rigGeometry";
import { cutHeadLayers } from "./synthesis/layers";

const ZOOM = 6, GRAY = 0.55;
const bust = syntheticBust(2), rig = synthesizeRig(bust.landmarks), layers = cutHeadLayers(bust.image, rig);
const found = layers.find((layer) => layer.name === "eye0_ball");
if (!found) throw new Error("The synthetic bust has no eye ball layer.");
const ball = found;
const tone = scleraTone(ball.image.data);

function paint(canvas: HTMLCanvasElement, image: PixelImage): void {
  canvas.width = image.width * ZOOM; canvas.height = image.height * ZOOM;
  const context = canvas.getContext("2d");
  if (!context) return;
  const pixels = context.createImageData(image.width, image.height);
  for (let k = 0; k < image.data.length; k += 4) {
    const a = image.data[k + 3] / 255;
    for (let c = 0; c < 3; c++) pixels.data[k + c] = Math.round(image.data[k + c] + GRAY * 255 * (1 - a));
    pixels.data[k + 3] = 255;
  }
  const scratch = document.createElement("canvas");
  scratch.width = image.width; scratch.height = image.height;
  scratch.getContext("2d")?.putImageData(pixels, 0, 0);
  context.imageSmoothingEnabled = false;
  context.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}

function BallPane({ mode, gaze }: { mode: GazeMode; gaze: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const title = mode === "dome" ? "Dome warp (before)" : "Iris slide (after)";
  useEffect(() => { if (canvas.current) paint(canvas.current, renderOpenBall(ball.image, ball.rect, rig.eyes[0], gazeOffset(0, gaze, 0), mode, tone)); }, [mode, gaze]);
  return <figure style={{ margin: 0 }}>
    <canvas ref={canvas} role="img" aria-label={`${title}: gaze ${gaze}`} style={{ display: "block", imageRendering: "pixelated" }} />
    <figcaption>{title}</figcaption>
  </figure>;
}

function LivePane({ gaze }: { gaze: number }) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<HeadRenderer | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    const element = canvas.current;
    if (!element) return;
    void Promise.all(syntheticHead.layers.map((layer) => headImage(layer.image, new AbortController().signal))).then((images) => {
      if (!live) return;
      const head = new HeadRenderer(element, syntheticHead);
      syntheticHead.layers.forEach((layer, index) => head.add(layer, images[index]));
      renderer.current = head;
      setReady(true);
    });
    return () => { live = false; renderer.current?.destroy(); renderer.current = null; };
  }, []);
  useEffect(() => { if (ready) renderer.current?.draw({ ...restHead(), gazeX: gaze }); }, [gaze, ready]);
  return <figure style={{ margin: 0 }}>
    <canvas ref={canvas} role="img" aria-label={`Live head: gaze ${gaze}`} data-ready={ready ? "true" : "false"} style={{ width: 192, height: 288, background: "#8c8c8c", display: "block" }} />
    <figcaption>Live head (WebGL)</figcaption>
  </figure>;
}

function GazeBeforeAfter() {
  const [gaze, setGaze] = useState(1);
  return <div style={{ pointerEvents: "auto" }}>
    <label>Gaze <select value={gaze} onChange={(event) => setGaze(Number(event.target.value))}>
      {[-1, 0, 1].map((value) => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <p data-so="sclera-tone">Sclera tone: {tone ? tone.map((value) => value.toFixed(2)).join(", ") : "unreadable"}</p>
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      <BallPane mode="dome" gaze={gaze} />
      <BallPane mode="slide" gaze={gaze} />
      <LivePane gaze={gaze} />
    </div>
  </div>;
}

const meta: Meta = { title: "Sprites/LiveHeadGaze", parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj;

export const IrisAtExtremeGaze: Story = {
  render: () => <GazeBeforeAfter />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^Sclera tone: 0\.9/)).toBeVisible();
    await waitFor(() => expect(canvasElement.querySelector("canvas[data-ready]")?.getAttribute("data-ready")).toBe("true"), { timeout: 15000 });
    for (const gaze of ["-1", "0", "1"]) {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Gaze" }), gaze);
      await expect(canvas.getByRole("img", { name: `Iris slide (after): gaze ${gaze}` })).toBeInTheDocument();
      await expect(canvas.getByRole("img", { name: `Live head: gaze ${gaze}` })).toBeVisible();
    }
  },
};

import React, { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import type { RunGuard } from "@runtime/runToken";
import type { PixelImage } from "../builder/pixels";
import { encodeImage } from "../builder/images";
import { StreamActivity } from "../animation";
import { restHead, type HeadParameters } from "./drivers";
import { cutDrawn, type DrawnSource } from "./drawn";
import { headImage } from "./load";
import { LiveHead } from "./LiveHead";
import { HeadRenderer } from "./renderer";
import { decodeBytes } from "./synthesis/decode";
import { syntheticHead, syntheticRef } from "./synthetic";
import { syntheticFrames } from "./syntheticFrames";
import "../styles.css";

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });
const POSES: Record<string, Partial<HeadParameters>> = {
  "Eyes closed": { eyeOpen: 0 }, Talking: { mouthOpen: 0.45 }, "Open mouth": { mouthOpen: 0.8 }, "Rounded oh": { mouthOpen: 0.75, mouthForm: 0.6 },
  "Wide ee": { mouthOpen: 0.5, mouthForm: -0.85 }, "Gaze right": { gazeX: 1 }, "Gaze left": { gazeX: -1 }, Rest: {},
};

async function syntheticArt(): Promise<{ art: PixelImage; frames: ReturnType<typeof syntheticFrames> }> {
  const bytes = new Uint8Array(await (await fetch(syntheticHead.source)).arrayBuffer());
  const art = await decodeBytes(bytes, new AbortController().signal);
  return { art, frames: syntheticFrames(art, syntheticHead.rig) };
}

function Pane({ title, drawn, pose }: { title: string; drawn: boolean; pose: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<HeadRenderer | null>(null);
  const [names, setNames] = useState<string | null>(null), [mouth, setMouth] = useState("loading");
  useEffect(() => {
    let live = true;
    const element = canvas.current;
    if (!element) return;
    void (async () => {
      const images = await Promise.all(syntheticHead.layers.map((layer) => headImage(layer.image, new AbortController().signal)));
      const { art, frames } = await syntheticArt();
      if (!live) return;
      const head = new HeadRenderer(element, syntheticHead);
      syntheticHead.layers.forEach((layer, index) => head.add(layer, images[index]));
      if (drawn) head.addDrawn(cutDrawn(syntheticHead.rig, art, frames).sprites);
      renderer.current = head;
      setNames(head.drawnNames().join(", ") || "none"); setMouth(head.mouthMode());
    })();
    return () => { live = false; renderer.current?.destroy(); renderer.current = null; };
  }, [drawn]);
  useEffect(() => { if (names !== null) renderer.current?.draw({ ...restHead(), ...POSES[pose] }); }, [pose, names]);
  return <figure style={{ margin: 0 }}>
    <canvas ref={canvas} aria-label={`${title}: ${pose}`} role="img" style={{ width: 192, height: 288, background: "#8c8c8c", display: "block" }} />
    <figcaption>{title}<br /><span data-so="drawn-names">Drawn sprites: {names ?? "loading"}</span><br /><span data-so="mouth-mode">Mouth: {mouth}</span></figcaption>
  </figure>;
}

function BeforeAfter() {
  const [pose, setPose] = useState("Eyes closed");
  return <div style={{ pointerEvents: "auto" }}>
    <label>Pose <select value={pose} onChange={(event) => setPose(event.target.value)}>
      {Object.keys(POSES).map((name) => <option key={name}>{name}</option>)}
    </select></label>
    <div style={{ display: "flex", gap: 16 }}>
      <Pane title="Mesh only (before)" drawn={false} pose={pose} />
      <Pane title="Drawn frames (after)" drawn pose={pose} />
    </div>
  </div>;
}

function MeshOnlyLive() {
  const [activity] = useState(() => new StreamActivity());
  return <div style={{ pointerEvents: "auto" }}>
    <button type="button" className="menu_button" onClick={() => { void activity.visemes().then(() => activity.pulse("Shape", "Hello, how are you today?")); }}>Stream reply</button>
    <div id="so-vn-root" style={{ position: "relative", width: "100%", maxWidth: 360, height: 420 }}>
      <div className="so-sprite" style={{ width: "100%", left: "50%" }}><div className="so-sprite-breath">
        <img src={syntheticHead.source} alt="Synthetic shape bust" />
        <LiveHead binding={syntheticRef} name="Shape" label="neutral" activity={activity} motion breathing blink mouth beginRun={owner} />
      </div></div>
    </div>
  </div>;
}

function LiveWithFrames({ shapes = false }: { shapes?: boolean }) {
  const [activity] = useState(() => new StreamActivity());
  const [drawn, setDrawn] = useState<DrawnSource | null>(null), [viseme, setViseme] = useState("none");
  useEffect(() => {
    const timer = setInterval(() => { const sample = activity.mouth("Shape"); if (sample) setViseme(`${sample.viseme} ${sample.open.toFixed(2)}`); }, 30);
    return () => clearInterval(timer);
  }, [activity]);
  useEffect(() => {
    let live = true;
    void syntheticArt().then(({ frames }) => {
      const url = (image: PixelImage) => `data:image/png;base64,${encodeImage(image)}`;
      if (live) setDrawn({ frames: { blink: url(frames.blink), talk: url(frames.talk), talk2: url(frames.talk2),
        ...(shapes ? { mouth_o: url(frames.mouth_o), mouth_wide: url(frames.mouth_wide) } : {}) } });
    });
    return () => { live = false; };
  }, [shapes]);
  return <div style={{ pointerEvents: "auto" }}>
    <button type="button" className="menu_button" onClick={() => { void activity.visemes().then(() => activity.pulse("Shape", "Hello, how are you today?")); }}>Stream reply</button>
    <output data-so="viseme" aria-label="Viseme mouth">{viseme}</output>
    <div id="so-vn-root" style={{ position: "relative", width: "100%", maxWidth: 360, height: 420 }}>
      <div className="so-sprite" style={{ width: "100%", left: "50%" }}><div className="so-sprite-breath">
        <img src={syntheticHead.source} alt="Synthetic shape bust" />
        {drawn && <LiveHead binding={syntheticRef} name="Shape" label="neutral" activity={activity} motion breathing blink mouth beginRun={owner} drawn={drawn} />}
      </div></div>
    </div>
  </div>;
}

const meta: Meta = { title: "Sprites/LiveHeadDrawn", parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj;

export const MeshVersusDrawn: Story = {
  render: () => <BeforeAfter />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Drawn sprites: eyes_closed_0, eyes_closed_1, mouth_talk, mouth_talk2, mouth_o, mouth_wide")).toBeVisible(), { timeout: 15000 });
    await expect(canvas.getByText("Drawn sprites: none")).toBeVisible();
    await expect(canvas.getByText("Mouth: capped")).toBeVisible();
    await expect(canvas.getByText("Mouth: full")).toBeVisible();
    for (const pose of ["Talking", "Rounded oh", "Wide ee", "Gaze right", "Eyes closed"]) {
      await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Pose" }), pose);
      await expect(canvas.getByRole("img", { name: `Drawn frames (after): ${pose}` })).toBeInTheDocument();
    }
  },
};

export const LiveHeadWithFrames: Story = {
  render: () => <LiveWithFrames />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const head = () => canvasElement.querySelector<HTMLCanvasElement>("canvas.so-live-head");
    await waitFor(() => expect(head()?.dataset.liveHeadDrawn).toBe("eyes_closed_0 eyes_closed_1 mouth_talk mouth_talk2"), { timeout: 15000 });
    await waitFor(() => expect(head()?.dataset.liveHeadMouth).toBe("full"), { timeout: 15000 });
    await waitFor(() => expect(canvasElement.querySelector<HTMLCanvasElement>("canvas.so-live-head")?.parentElement?.dataset.liveHeadReady).toBe("true"), { timeout: 15000 });
    await userEvent.click(canvas.getByRole("button", { name: "Stream reply" }));
    await waitFor(() => expect(canvas.getByLabelText("Viseme mouth")).not.toHaveTextContent("none"), { timeout: 5000 });
    await expect(canvasElement.querySelector("canvas.so-live-head")).toHaveStyle({ visibility: "visible" });
  },
};

export const MeshOnlyMouthCapped: Story = {
  render: () => <MeshOnlyLive />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const head = () => canvasElement.querySelector<HTMLCanvasElement>("canvas.so-live-head");
    await waitFor(() => expect(head()?.parentElement?.dataset.liveHeadReady).toBe("true"), { timeout: 15000 });
    await expect(head()?.dataset.liveHeadMouth).toBe("capped");
    await expect(head()?.dataset.liveHeadDrawn).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "Stream reply" }));
    await expect(head()).toHaveStyle({ visibility: "visible" });
    await expect(head()?.dataset.liveHeadMouth).toBe("capped");
  },
};

export const LiveHeadWithMouthShapes: Story = {
  render: () => <LiveWithFrames shapes />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const head = () => canvasElement.querySelector<HTMLCanvasElement>("canvas.so-live-head");
    await waitFor(() => expect(head()?.dataset.liveHeadDrawn).toBe("eyes_closed_0 eyes_closed_1 mouth_talk mouth_talk2 mouth_o mouth_wide"), { timeout: 15000 });
    await waitFor(() => expect(head()?.dataset.liveHeadMouth).toBe("full"), { timeout: 15000 });
    await userEvent.click(canvas.getByRole("button", { name: "Stream reply" }));
    await waitFor(() => expect(canvas.getByLabelText("Viseme mouth")).not.toHaveTextContent("none"), { timeout: 5000 });
    await expect(head()).toHaveStyle({ visibility: "visible" });
  },
};

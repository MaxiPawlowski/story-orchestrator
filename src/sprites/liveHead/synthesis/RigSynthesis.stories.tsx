import React, { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import type { RunGuard } from "@runtime/runToken";
import { contentHash } from "../../builder/recipes";
import { encodeImage } from "../../builder/images";
import RigPreview from "../RigPreview";
import type { HeadManifest } from "../manifest";
import { syntheticBust } from "./syntheticBust";
import { encodePngStored, base64 } from "./png";
import { synthesizeHead } from "./synthesize";
import { decodeBytes } from "./decode";

const owner = (): RunGuard => ({ stillOwns: () => true, lapsed: () => null, lapsedDetail: () => null, signal: new AbortController().signal, release: () => undefined });

function Synthesized() {
  const [manifest, setManifest] = useState<HeadManifest | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const bust = syntheticBust(2), png = encodePngStored(bust.image);
    void contentHash(png).then((sha256) => synthesizeHead({ member: "shape", look: "look_synthetic", source: `data:image/png;base64,${base64(png)}`, sha256 }, owner(), {
      landmarks: async () => bust.landmarks, read: async () => png, hash: contentHash, decode: decodeBytes, encode: async (image) => encodeImage(image),
    })).then((result) => { if (live) setManifest(result); }).catch((reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { live = false; };
  }, []);
  return <div style={{ pointerEvents: "auto" }}>
    {error && <p role="alert">{error}</p>}
    {manifest ? <><p role="status">Synthesized rig: {manifest.layers.length} layers, {manifest.rig.image.width} x {manifest.rig.image.height}</p>
      <RigPreview manifest={manifest} name="Shape" beginRun={owner} width={240} /></> : !error && <p role="status">Synthesizing rig…</p>}
  </div>;
}

const meta: Meta = { title: "Sprites/RigSynthesis", render: () => <Synthesized />, parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj;
export const LandmarksToLiveHead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText(/Synthesized rig: 9 layers, 320 x 448/)).toBeVisible(), { timeout: 15000 });
    await waitFor(() => expect(canvasElement.querySelector<HTMLCanvasElement>("canvas.so-live-head")?.parentElement?.dataset.liveHeadReady).toBe("true"), { timeout: 15000 });
    await expect(canvasElement.querySelector("canvas.so-live-head")).toHaveStyle({ visibility: "visible" });
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Preview expression" }), "joy");
    await userEvent.click(canvas.getByRole("button", { name: "Preview talking" }));
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

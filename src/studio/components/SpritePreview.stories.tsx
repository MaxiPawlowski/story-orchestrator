import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import SpritePreview from "./SpritePreview";
import { SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";

const model = { name: "edit", sha256: "a".repeat(64), size: 1 };
const request = { character: "Test", set: "pilot", label: "happy", kind: "talk" as const, value: "happy", reference: "reference",
  box: { x: 0, y: 0, width: 32, height: 32 }, models: { diffusion: model, encoder: model, vae: model }, seed: 1, steps: 25 };
const meta: Meta<typeof SpritePreview> = { title: "Studio/SpritePreview", component: SpritePreview, args: {
  busy: false, saved: false, keep: () => {}, candidate: { request, key: "candidate", inputs: { ...request, base: "base" },
    data: SPRITE_FIXTURE_PNG, rawData: SPRITE_FIXTURE_PNG, referenceData: SPRITE_FIXTURE_PNG,
    qa: { ok: true, reasons: [], changed: 5, alphaPixels: 1, ringDrift: 0 }, seconds: 2,
    timings: { prepareMs: 100, leaseMs: 0, uploadMs: 0, renderMs: 0, decodeMs: 0, compositeMs: 100, referenceReleaseMs: 0, leaseReleaseMs: 0, totalMs: 200, cacheHit: true } },
} };
export default meta;
type Story = StoryObj<typeof SpritePreview>;

export const CachedEdit: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText("Raw edit reused; no image job.")).toBeVisible();
  await userEvent.click(canvas.getByText("Inspect the edit before compositing"));
  await expect(canvas.getByRole("img", { name: "Raw edit" })).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Keep this sprite" })).toBeEnabled();
} };

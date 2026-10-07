import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import ReferencePackPicker from "./ReferencePackPicker";
import { spriteBuilderFixtures } from "./spriteBuilderFixtures";

const meta: Meta<typeof ReferencePackPicker> = {
  title: "Studio/ReferencePackPicker", component: ReferencePackPicker,
  args: { character: "Test", discovery: await spriteBuilderFixtures.discover(), models: { diffusion: "edit", encoder: "encoder", vae: "vae" },
    box: { x: 0, y: 0, width: 32, height: 32 }, steps: 25, busy: false, setBusy: () => {}, services: spriteBuilderFixtures },
};
export default meta;
type Story = StoryObj<typeof ReferencePackPicker>;

export const ReusesDefaultExpressions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Use this expression pack" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await expect(await canvas.findByRole("status")).toHaveTextContent("Original images stay protected.");
  },
};

export const RefusesOpaqueReference: Story = {
  args: { services: { ...spriteBuilderFixtures, decode: async () => ({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(255), sha256: "a".repeat(64) }) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Use this expression pack" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("transparent background");
  },
};

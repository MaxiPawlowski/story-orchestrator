import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import BaseSpriteBuilder from "./BaseSpriteBuilder";
import { spriteBuilderFixtures, SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";

const meta: Meta<typeof BaseSpriteBuilder> = {
  title: "Studio/BaseSpriteBuilder", component: BaseSpriteBuilder,
  args: { character: "Test", image: `data:image/png;base64,${SPRITE_FIXTURE_PNG}`, set: "pilot", models: { diffusion: "edit", encoder: "encoder", vae: "vae" },
    discovery: await spriteBuilderFixtures.discover(), steps: 25, seed: 1, busy: false, setBusy: () => {},
    builder: spriteBuilderFixtures.builder(), services: spriteBuilderFixtures },
};
export default meta;
type Story = StoryObj<typeof BaseSpriteBuilder>;

export const FourCandidates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Build a base from character-card art"));
    await userEvent.click(canvas.getByRole("button", { name: "Build four base candidates" }));
    await expect(await canvas.findByRole("button", { name: "Keep base 4" })).toBeEnabled();
    await expect(canvas.getAllByRole("img", { name: /Base candidate/ })).toHaveLength(4);
  },
};

export const MissingInstalledAlpha: Story = {
  args: { discovery: { ...await spriteBuilderFixtures.discover(), alpha: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Build a base from character-card art"));
    await expect(canvas.getByRole("button", { name: "Build four base candidates" })).toBeDisabled();
    await expect(canvas.getByRole("status")).toHaveTextContent("downloads no models");
  },
};

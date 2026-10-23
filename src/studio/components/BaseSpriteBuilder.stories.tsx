import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import BaseSpriteBuilder from "./BaseSpriteBuilder";
import { spriteBuilderFixtures, SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";
import { PLACEHOLDER_ART, ST_DEFAULT_AVATAR } from "../../sprites/cardArt";

const drawnCard = { ...spriteBuilderFixtures, decode: async (path: string) => path === ST_DEFAULT_AVATAR
  ? { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4).fill(90) } : spriteBuilderFixtures.decode(path) };

const meta: Meta<typeof BaseSpriteBuilder> = {
  title: "Studio/BaseSpriteBuilder", component: BaseSpriteBuilder,
  args: { character: "Test", image: `data:image/png;base64,${SPRITE_FIXTURE_PNG}`, set: "pilot", models: { diffusion: "edit", encoder: "encoder", vae: "vae" },
    discovery: await spriteBuilderFixtures.discover(), steps: 25, seed: 1, busy: false, setBusy: () => {},
    builder: spriteBuilderFixtures.builder(), services: drawnCard },
};
export default meta;
type Story = StoryObj<typeof BaseSpriteBuilder>;

export const OneCandidateThenAnother: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Build a base from character-card art"));
    await userEvent.click(canvas.getByRole("button", { name: "Build a base candidate" }));
    await expect(await canvas.findByRole("button", { name: "Keep base 1" })).toBeEnabled();
    await expect(canvas.getAllByRole("img", { name: /Base candidate/ })).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Make another candidate" }));
    await expect(await canvas.findByRole("button", { name: "Keep base 2" })).toBeEnabled();
    await expect(canvas.getAllByRole("img", { name: /Base candidate/ })).toHaveLength(2);
  },
};

export const MissingInstalledAlpha: Story = {
  args: { discovery: { ...await spriteBuilderFixtures.discover(), alpha: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Build a base from character-card art"));
    await expect(canvas.getByRole("button", { name: "Build a base candidate" })).toBeDisabled();
    await expect(canvas.getByRole("status")).toHaveTextContent("downloads no models");
  },
};

export const DefaultCardPicture: Story = {
  args: { services: spriteBuilderFixtures },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Build a base from character-card art"));
    await userEvent.click(canvas.getByRole("button", { name: "Build a base candidate" }));
    await expect(await canvas.findByText(PLACEHOLDER_ART, { exact: false })).toBeVisible();
    await expect(canvas.queryAllByRole("img", { name: /Base candidate/ })).toHaveLength(0);
  },
};

const refusesFirst = () => {
  const real = spriteBuilderFixtures.builder();
  let calls = 0;
  return { ...real, build: async (request: Parameters<typeof real.build>[0]) => {
    calls += 1;
    if (calls === 1) throw new Error("The reference needs a visible subject and a transparent background.");
    return real.build(request);
  } };
};

export const RetriesOnlyAfterARefusal: Story = {
  args: { builder: refusesFirst() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Build a base from character-card art"));
    await userEvent.click(canvas.getByRole("button", { name: "Build a base candidate" }));
    await expect(await canvas.findByRole("button", { name: "Keep base 1" })).toBeEnabled();
    await expect(canvas.getAllByRole("img", { name: /Base candidate/ })).toHaveLength(1);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Candidate 1:");
  },
};

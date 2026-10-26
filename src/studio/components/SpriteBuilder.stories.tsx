import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import SpriteBuilder, { type SpriteBuilderHost } from "./SpriteBuilder";
import { useDraftStore, newStoryDraft } from "../draft";
import { EDIT_NODES } from "../../sprites/builder/recipes";

const services: SpriteBuilderHost = {
  members: () => [{ name: "Test", folder: "Test" }],
  list: async () => [],
  discover: async () => ({ nodes: Object.fromEntries(EDIT_NODES.map((node) => [node, {}])), embeddings: [], checkpoints: [],
    diffusionModels: ["edit-model"], textEncoders: ["encoder"], vaes: ["vae"], loras: [], upscalers: [] }),
  fingerprint: async (_kind, name) => ({ name, sha256: "a".repeat(64), size: 1 }),
  manifest: async () => null,
  sets: async () => [], delete: async () => ({ ok: true, deleted: true }),
  referenceSets: async () => [""], referencePack: async (character, set) => ({ character, set, sha256: "a".repeat(64), files: [] }),
  decode: async () => ({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) }),
  builder: () => ({ close: () => {}, cancel: () => {}, build: async () => { throw new Error("Synthetic render refused."); },
    save: async () => { throw new Error("No preview to save."); } }),
};

const meta: Meta<typeof SpriteBuilder> = {
  title: "Studio/SpriteBuilder", component: SpriteBuilder, args: { services },
  beforeEach: () => { useDraftStore.getState().loadDraft({ ...newStoryDraft(), roster: [{ id: "test", name: "Test" }] }); },
};
export default meta;
type Story = StoryObj<typeof SpriteBuilder>;

export const DiscoverSetup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Discover image-edit setup" }));
    await expect(await canvas.findByRole("combobox", { name: "diffusion" })).toHaveValue("edit-model");
    await expect(canvas.getByRole("button", { name: "Generate preview" })).toBeDisabled();
  },
};

export const MissingBackend: Story = {
  args: { services: { ...services, discover: async () => { throw new Error("Start the image service first."); } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Discover image-edit setup" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Start the image service first.");
  },
};

export const NoCast: Story = { args: { services: { ...services, members: () => [] } } };

export const ClosedMouthRest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Edit" }), "rest");
    await userEvent.click(canvas.getByText("Mouth replacement region"));
    await expect(canvas.getByRole("spinbutton", { name: "Mouth feather" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Generate preview" })).toBeDisabled();
  },
};

export const RefusesEmptyReferencePack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Discover image-edit setup" }));
    const button = await canvas.findByRole("button", { name: "Use this expression pack" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Choose an expression pack with a neutral reference.");
  },
};

export const DetectedReferenceBox: Story = {
  args: { services: { ...services,
    list: async () => [{ label: "neutral", path: "/characters/Test/measured/neutral.png" }],
    decode: async () => ({ width: 400, height: 600, data: new Uint8ClampedArray(400 * 600 * 4) }),
    detect: async () => ({ width: 400, height: 600, faces: [{ box: [150, 78, 250, 202, 0.95],
      points: Array.from({ length: 28 }, (_, at) => at === 2 ? [200, 202, 0.9] : [200, 150, 0.9]) }] }),
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("spinbutton", { name: /^height$/ })).toHaveValue(248));
    await expect(canvas.getByRole("spinbutton", { name: /^width$/ })).toHaveValue(298);
    await expect(canvas.getByRole("spinbutton", { name: /^y$/ })).toHaveValue(21);
  },
};

let releaseDetect: (() => void) | null = null;
export const HeadBoxWaitsForItsReference: Story = {
  args: { services: { ...services,
    list: async () => [{ label: "neutral", path: "/characters/Test/measured/neutral.png" }],
    decode: async () => ({ width: 400, height: 600, data: new Uint8ClampedArray(400 * 600 * 4) }),
    detect: () => new Promise((resolve) => { releaseDetect = () => resolve(null); }),
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Finding the head box for this reference…")).toBeInTheDocument();
    await expect(canvas.getByRole("spinbutton", { name: /^height$/ })).toBeDisabled();
    await expect(canvasElement.querySelector("#so-sprite-builder")).toHaveAttribute("data-box-ready", "false");
    await waitFor(() => expect(releaseDetect).not.toBeNull());
    releaseDetect?.();
    await waitFor(() => expect(canvasElement.querySelector("#so-sprite-builder")).toHaveAttribute("data-box-ready", "true"));
    await expect(canvas.getByRole("spinbutton", { name: /^height$/ })).toBeEnabled();
  },
};

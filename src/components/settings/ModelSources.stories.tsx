import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import ModelSources, { type ModelSourcesApi } from "../../image/ModelSources";

const card = {
  id: "p1", provider: "civitai" as const, name: "ink-lines.safetensors", sha256: "a".repeat(64), sizeBytes: 228 * 1024 ** 2, kind: "loras", baseModel: "Illustrious", nsfw: false,
  termsUrl: "https://civitai.com/models/77", source: "Civitai Ink Lines · v1", root: "/models/loras", folders: ["/models/loras"], present: false,
  freeBytes: 40 * 1024 ** 3, marginBytes: 2 * 1024 ** 3, fits: true, resumeFromBytes: 0,
};

const api = (overrides: Partial<ModelSourcesApi> = {}): ModelSourcesApi => ({
  modelKeyStatus: fn(async () => ({ civitai: true, huggingface: false })),
  testModelKey: fn(async () => ({ ok: true, set: true, message: "The provider accepted the token." })),
  writeModelKey: fn(async () => ({ ok: true as const })),
  planModelDownload: fn(async () => card),
  startModelDownload: fn(async () => ({ id: "j1", planId: "p1", name: card.name, root: card.root, state: "done", bytes: card.sizeBytes, total: card.sizeBytes, error: null })),
  modelDownloads: fn(async () => []),
  cancelModelDownload: fn(async () => ({ id: "j1", planId: "p1", name: card.name, root: card.root, state: "cancelled", bytes: 0, total: card.sizeBytes, error: null })),
  ...overrides,
});

const meta: Meta<typeof ModelSources> = { title: "Settings/ModelSources", component: ModelSources, args: { api: api() } };

export default meta;

type Story = StoryObj<typeof ModelSources>;

export const TokensAreWriteOnly: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("(set)")).toBeInTheDocument();
    const field = canvas.getByLabelText(/Hugging Face token/);
    await expect(field).toHaveAttribute("type", "password");
    await userEvent.type(field, "hf_secret");
    await userEvent.click(within(canvasElement.querySelector("[data-so=model-key-huggingface]") as HTMLElement).getByRole("button", { name: "Save" }));
    await expect(args.api?.writeModelKey).toHaveBeenCalledWith("huggingface", "hf_secret");
    await expect(field).toHaveValue("");
  },
};

export const NothingDownloadsWithoutTheCardsButton: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Civitai model version"), "4242");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText("ink-lines.safetensors · 0.22 GiB")).toBeInTheDocument();
    await expect(args.api?.startModelDownload).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Download" }));
    await expect(args.api?.startModelDownload).toHaveBeenCalledWith("p1");
    await expect(await canvas.findByText("ink-lines.safetensors: verified and installed.")).toBeInTheDocument();
  },
};

export const NotEnoughSpaceDisablesDownload: Story = {
  args: { api: api({ planModelDownload: fn(async () => ({ ...card, fits: false, freeBytes: 1024 ** 3 })) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Civitai model version"), "4242");
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText(/Not enough space there/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Download" })).toBeDisabled();
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import BundledWorkflowsPanel from "./BundledWorkflowsPanel";

const graph = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "illustrious.safetensors" } },
  2: { class_type: "CLIPTextEncode", inputs: { text: "%prompt%" } },
  3: { class_type: "FaceDetailer", inputs: {} },
};

const meta: Meta<typeof BundledWorkflowsPanel> = {
  title: "Studio/BundledWorkflowsPanel",
  component: BundledWorkflowsPanel,
  args: {
    bundle: { "SO-Portrait.json": { graph, sha256: "a".repeat(64) } },
    mapped: ["SO-Portrait.json"],
    nodes: ["CheckpointLoaderSimple", "CLIPTextEncode"],
    onBundle: fn(async () => "1 workflow(s) copied into the story."),
    onInstall: fn(async () => ({ ok: true as const, name: "SO-Portrait-2.json", present: false, renamedFrom: "SO-Portrait.json" })),
    onDrop: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof BundledWorkflowsPanel>;

export const ShowsNodesAndInstallsCreateOnly: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Not on this ComfyUI: FaceDetailer/)).toBeInTheDocument();
    await expect(canvas.getByText(/Models it loads: illustrious.safetensors/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Install in SillyTavern" }));
    await expect(args.onInstall).toHaveBeenCalledWith("SO-Portrait.json", expect.objectContaining({ graph }));
    await expect(await canvas.findByText(/Installed as SO-Portrait-2.json \(a different SO-Portrait.json exists and was left alone\)/)).toBeInTheDocument();
  },
};

export const ACodeNodeCannotBeInstalled: Story = {
  args: { bundle: { "SO-Evil.json": { graph: { 1: { class_type: "ExecutePythonCode", inputs: { text: "%prompt%" } } }, sha256: "b".repeat(64) } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Can run code or read files: ExecutePythonCode/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Install in SillyTavern" })).toBeDisabled();
  },
};

export const ExportCopiesTheMappedWorkflows: Story = {
  args: { bundle: undefined },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Export with workflows" }));
    await expect(args.onBundle).toHaveBeenCalled();
    await expect(await canvas.findByText("1 workflow(s) copied into the story.")).toBeInTheDocument();
  },
};

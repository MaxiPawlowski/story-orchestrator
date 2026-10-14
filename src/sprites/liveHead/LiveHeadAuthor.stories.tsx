import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { LiveHeadAuthor } from "./LiveHeadAuthor";
import { syntheticHead } from "./synthetic";

const meta: Meta<typeof LiveHeadAuthor> = { title: "Sprites/LiveHeadAuthor", component: LiveHeadAuthor,
  args: { rows: [{ member: "shape", name: "Shape", look: "default", present: false }, { member: "other", name: "Other", look: "default", present: true }], onImport: fn() },
  parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj<typeof LiveHeadAuthor>;
export const StatusAndImport: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Shape (default): rig missing; static fallback")).toBeInTheDocument();
    await expect(canvas.getByText("Other (default): rig present")).toBeInTheDocument();
    await userEvent.click(canvas.getByText("Import a live head rig"));
    const input = canvas.getByRole("textbox", { name: "Rig package JSON" });
    await userEvent.type(input, "invalid");
    await userEvent.click(canvas.getByRole("button", { name: "Import rig" }));
    await expect(args.onImport).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste(JSON.stringify(syntheticHead));
    await userEvent.click(canvas.getByRole("button", { name: "Import rig" }));
    await expect(args.onImport).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("status")).toHaveTextContent("Rig imported for shape, default.");
  },
};

const degenerate = { ...syntheticHead, rig: { ...syntheticHead.rig, mouth: { ...syntheticHead.rig.mouth, halfLen: 0.25 } } };
export const ImportWithStillMouth: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Import a live head rig"));
    await userEvent.click(canvas.getByRole("textbox", { name: "Rig package JSON" }));
    await userEvent.paste(JSON.stringify(degenerate));
    await userEvent.click(canvas.getByRole("button", { name: "Import rig" }));
    await expect(args.onImport).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("status")).toHaveTextContent("Rig imported for shape, default. The rig's mouth region has no width. Its mouth stays still.");
  },
};

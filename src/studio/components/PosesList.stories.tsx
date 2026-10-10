import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import PosesList, { type PosesServices } from "./PosesList";
import { newStoryDraft, useDraftStore } from "../draft";

const services: PosesServices = { installed: () => [], saveInstalled: () => {}, render: async () => "Synthetic pose preview saved." };
const meta: Meta<typeof PosesList> = {
  title: "Studio/PosesList", component: PosesList, args: { services },
  parameters: { a11y: { disable: false }, viewport: { viewports: {
    pose390: { name: "390px", styles: { width: "390px", height: "900px" }, type: "mobile" },
    pose768: { name: "768px", styles: { width: "768px", height: "1024px" }, type: "tablet" },
    pose1440: { name: "1440px", styles: { width: "1440px", height: "900px" }, type: "desktop" },
  } } },
  beforeEach: () => { const draft = { ...newStoryDraft(), roster: [{ id: "arin", name: "Arin" }] }; useDraftStore.getState().loadDraft(draft); },
};
export default meta;
type Story = StoryObj<typeof PosesList>;
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: /skeleton/i })).toBeVisible();
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Pose" }), "sit_chair");
    await userEvent.click(canvas.getByRole("button", { name: "Use as default pose" }));
    await expect(useDraftStore.getState().draft.roster[0].sprites?.pose).toBe("sit_chair");
    await userEvent.click(canvas.getByRole("button", { name: "Copy pose to editor" }));
    await expect(canvas.getByRole("textbox", { name: "Pose JSON" })).toHaveValue(expect.stringContaining("sit_chair"));
    await userEvent.click(canvas.getByRole("button", { name: "Import pose JSON" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Imported 1 pose");
  },
};
export const Narrow: Story = { parameters: { viewport: { defaultViewport: "pose390" } }, ...Default };
export const Tablet: Story = { parameters: { viewport: { defaultViewport: "pose768" } }, ...Default };
export const Wide: Story = { parameters: { viewport: { defaultViewport: "pose1440" } }, ...Default };
export const InvalidImport: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Pose JSON" }), "broken");
    await userEvent.click(canvas.getByRole("button", { name: "Import pose JSON" }));
    await expect(canvas.getByRole("status")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Extract skeleton with installed DWPose" })).toBeDisabled();
  },
};

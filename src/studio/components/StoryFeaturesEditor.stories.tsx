import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import StoryFeaturesEditor from "./StoryFeaturesEditor";
import { seedDraft, sampleStory } from "../stories/fixtures";
import { useDraftStore } from "../draft";

const meta: Meta<typeof StoryFeaturesEditor> = {
  title: "Studio/StoryFeaturesEditor", component: StoryFeaturesEditor,
  beforeEach: () => { seedDraft(sampleStory()); },
};
export default meta;
type Story = StoryObj<typeof StoryFeaturesEditor>;
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvasElement.querySelector('[data-so="feature-row"][data-feature="inner"]') as HTMLElement;
    await expect(row).not.toBeNull();
    const toggle = canvasElement.querySelector("#so-feature-inner-enabled") as HTMLElement;
    const wasOn = toggle.getAttribute("aria-checked") === "true";
    await userEvent.click(toggle);
    await expect(useDraftStore.getState().draft.features?.inner).toEqual({ enabled: !wasOn });
    await userEvent.click(within(row).getByRole("button", { name: /^Reset / }));
    await expect(useDraftStore.getState().draft.features?.inner).toBeUndefined();
    await expect(canvas.getByRole("searchbox", { name: "Filter features" })).toBeInTheDocument();
  },
};
export const OnlyChangedFromDefault: Story = {
  beforeEach: () => { seedDraft({ ...sampleStory(), features: { inner: "off" } }); },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Changed" }));
    await expect([...canvasElement.querySelectorAll('[data-so="feature-row"]')].map((row) => row.getAttribute("data-feature"))).toEqual(["inner"]);
  },
};
export const Mobile: Story = { ...Desktop, parameters: { viewport: { defaultViewport: "mobile1" } } };

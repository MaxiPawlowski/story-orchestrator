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
    await userEvent.click(canvas.getByText("Private inner voice · Default"));
    await userEvent.selectOptions(canvas.getByLabelText("Private inner voice policy"), "off");
    expect(useDraftStore.getState().draft.features?.inner).toBe("off");
    await userEvent.selectOptions(canvas.getByLabelText("Private inner voice policy"), "inherit");
    expect(useDraftStore.getState().draft.features?.inner).toBeUndefined();
  },
};
export const Mobile: Story = { ...Desktop, parameters: { viewport: { defaultViewport: "mobile1" } } };

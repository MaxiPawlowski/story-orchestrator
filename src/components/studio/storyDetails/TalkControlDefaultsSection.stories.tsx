import type { Meta, StoryObj } from "@storybook/react";
import TalkControlDefaultsSection from "./TalkControlDefaultsSection";

const meta: Meta<typeof TalkControlDefaultsSection> = {
  title: "Studio/StoryDetails/TalkControlDefaultsSection",
  component: TalkControlDefaultsSection,
};

export default meta;
type Story = StoryObj<typeof TalkControlDefaultsSection>;

export const Default: Story = {};

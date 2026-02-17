import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { StoryDraft } from "@utils/checkpoint-studio";
import StoryMetadataSection from "./StoryMetadataSection";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = (args: { draft: StoryDraft; globalLorebooks: string[] }) => {
  const [draft, setDraft] = useState<StoryDraft>(args.draft);
  return <StoryMetadataSection draft={draft} setDraft={setDraft} globalLorebooks={args.globalLorebooks} />;
};

const meta: Meta<typeof StoryMetadataSection> = {
  title: "Studio/StoryDetails/StoryMetadataSection",
  component: StoryMetadataSection,
  render: (args) => <Stateful {...(args as any)} />,
};

export default meta;
type Story = StoryObj<typeof StoryMetadataSection>;

export const Default: Story = {
  args: {
    draft: mockDraft,
    globalLorebooks: ["Lorebook Alpha", "Lorebook Beta"],
  } as any,
};

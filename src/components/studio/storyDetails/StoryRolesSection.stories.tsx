import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { StoryDraft } from "@utils/checkpoint-studio";
import StoryRolesSection from "./StoryRolesSection";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = (args: { draft: StoryDraft; groupMembers: string[]; allCharacters: string[] }) => {
  const [draft, setDraft] = useState<StoryDraft>(args.draft);
  return (
    <StoryRolesSection
      draft={draft}
      setDraft={setDraft}
      groupMembers={args.groupMembers}
      allCharacters={args.allCharacters}
    />
  );
};

const meta: Meta<typeof StoryRolesSection> = {
  title: "Studio/StoryDetails/StoryRolesSection",
  component: StoryRolesSection,
  render: (args) => <Stateful {...(args as any)} />,
};

export default meta;
type Story = StoryObj<typeof StoryRolesSection>;

export const Default: Story = {
  args: {
    draft: mockDraft,
    groupMembers: ["Narrator", "Arin"],
    allCharacters: ["Narrator", "Arin", "Guide", "Merchant"],
  } as any,
};

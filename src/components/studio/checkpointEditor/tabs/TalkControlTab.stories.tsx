import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import TalkControlTab from "./TalkControlTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  return (
    <TalkControlTab
      draft={draft}
      checkpoint={checkpoint}
      updateCheckpoint={(id, updater) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => (cp.id === id ? updater(cp) : cp)),
      }))}
    />
  );
};

const meta: Meta<typeof TalkControlTab> = {
  title: "Studio/Tabs/TalkControlTab",
  component: TalkControlTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof TalkControlTab>;

export const Default: Story = {};

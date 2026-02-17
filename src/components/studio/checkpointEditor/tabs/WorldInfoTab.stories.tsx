import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import WorldInfoTab from "./WorldInfoTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  return (
    <WorldInfoTab
      draft={draft}
      checkpoint={checkpoint}
      updateCheckpoint={(id, updater) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => cp.id === id ? updater(cp) : cp),
      }))}
    />
  );
};

const meta: Meta<typeof WorldInfoTab> = {
  title: "Studio/Tabs/WorldInfoTab",
  component: WorldInfoTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof WorldInfoTab>;

export const Default: Story = {};

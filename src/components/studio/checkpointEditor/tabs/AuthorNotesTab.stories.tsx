import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import AuthorNotesTab from "./AuthorNotesTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  return (
    <AuthorNotesTab
      draft={draft}
      checkpoint={checkpoint}
      updateCheckpoint={(id, updater) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => cp.id === id ? updater(cp) : cp),
      }))}
    />
  );
};

const meta: Meta<typeof AuthorNotesTab> = {
  title: "Studio/Tabs/AuthorNotesTab",
  component: AuthorNotesTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof AuthorNotesTab>;

export const Default: Story = {};

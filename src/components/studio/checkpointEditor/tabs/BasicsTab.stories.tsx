import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import BasicsTab from "./BasicsTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const [referenceQuery, setReferenceQuery] = useState("");
  const checkpoint = draft.checkpoints[0];
  return (
    <BasicsTab
      draft={draft}
      checkpoint={checkpoint}
      referenceQuery={referenceQuery}
      onReferenceQueryChange={setReferenceQuery}
      projectSlashCommands={[{ name: "checkpoint", aliases: ["cp"], description: "Manage checkpoints", samples: ["/checkpoint list"], isStoryOrchestrator: true }]}
      onCheckpointIdChange={(id, nextId) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => cp.id === id ? { ...cp, id: nextId } : cp),
      }))}
      updateCheckpoint={(id, updater) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => cp.id === id ? updater(cp) : cp),
      }))}
    />
  );
};

const meta: Meta<typeof BasicsTab> = {
  title: "Studio/Tabs/BasicsTab",
  component: BasicsTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof BasicsTab>;

export const Default: Story = {};

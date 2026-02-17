import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import CheckpointEditorPanel from "./CheckpointEditorPanel";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  const outgoing = draft.transitions.filter((edge) => edge.from === checkpoint.id);
  return (
    <CheckpointEditorPanel
      draft={draft}
      selectedCheckpoint={checkpoint}
      outgoingTransitions={outgoing}
      onCheckpointIdChange={(id, value) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => (cp.id === id ? { ...cp, id: value } : cp)),
      }))}
      updateCheckpoint={(id, updater) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => (cp.id === id ? updater(cp) : cp)),
      }))}
      onAddTransition={(fromId) => setDraft((prev) => ({
        ...prev,
        transitions: [...prev.transitions, {
          id: `edge-${prev.transitions.length + 1}`,
          from: fromId,
          to: prev.checkpoints[0]?.id ?? fromId,
          label: "",
          description: "",
          _stableId: `stable-${Date.now()}`,
          trigger: { type: "regex", patterns: ["/next/i"], condition: "advance" },
        }],
      }))}
      onRemoveTransition={(transitionId) => setDraft((prev) => ({
        ...prev,
        transitions: prev.transitions.filter((edge) => edge.id !== transitionId),
      }))}
      updateTransition={(transitionId, patch) => setDraft((prev) => ({
        ...prev,
        transitions: prev.transitions.map((edge) => edge.id === transitionId ? { ...edge, ...patch } : edge),
      }))}
      onRemoveCheckpoint={(id) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.filter((cp) => cp.id !== id),
      }))}
      setDraft={setDraft}
    />
  );
};

const meta: Meta<typeof CheckpointEditorPanel> = {
  title: "Studio/CheckpointEditorPanel",
  component: CheckpointEditorPanel,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof CheckpointEditorPanel>;

export const Default: Story = {};

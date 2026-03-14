import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import CheckpointEditorPanel from "./CheckpointEditorPanel";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  const outgoing = checkpoint.transitions ?? [];
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
        checkpoints: prev.checkpoints.map((cp) => cp.id !== fromId ? cp : {
          ...cp,
          transitions: [...(cp.transitions ?? []), {
            id: `edge-${(cp.transitions ?? []).length + 1}`,
            to: prev.checkpoints[1]?.id ?? fromId,
            label: "",
            description: "",
            _stableId: `stable-${Date.now()}`,
            trigger: { type: "regex", patterns: ["/next/i"], condition: "advance" },
          }],
        }),
      }))}
      onRemoveTransition={(transitionId) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => ({
          ...cp,
          transitions: cp.transitions?.filter((edge) => edge.id !== transitionId),
        })),
      }))}
      updateTransition={(transitionId, patch) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => ({
          ...cp,
          transitions: cp.transitions?.map((edge) => edge.id === transitionId ? { ...edge, ...patch } : edge),
        })),
      }))}
      onRemoveCheckpoint={(id) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.filter((cp) => cp.id !== id),
      }))}
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

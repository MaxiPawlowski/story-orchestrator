import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import TransitionsTab from "./TransitionsTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  const outgoingTransitions = checkpoint.transitions ?? [];

  return (
    <TransitionsTab
      draft={draft}
      checkpoint={checkpoint}
      outgoingTransitions={outgoingTransitions}
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
    />
  );
};

const meta: Meta<typeof TransitionsTab> = {
  title: "Studio/Tabs/TransitionsTab",
  component: TransitionsTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof TransitionsTab>;

export const Default: Story = {};

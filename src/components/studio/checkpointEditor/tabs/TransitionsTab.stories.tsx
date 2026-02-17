import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import TransitionsTab from "./TransitionsTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const checkpoint = draft.checkpoints[0];
  const outgoingTransitions = draft.transitions.filter((edge) => edge.from === checkpoint.id);

  return (
    <TransitionsTab
      draft={draft}
      checkpoint={checkpoint}
      outgoingTransitions={outgoingTransitions}
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

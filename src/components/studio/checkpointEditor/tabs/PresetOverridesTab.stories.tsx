import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import PresetOverridesTab from "./PresetOverridesTab";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  const [presetDrafts, setPresetDrafts] = useState<any>({});
  const checkpoint = draft.checkpoints[0];
  return (
    <PresetOverridesTab
      draft={draft}
      checkpoint={checkpoint}
      presetDrafts={presetDrafts}
      setPresetDrafts={setPresetDrafts}
      updateCheckpoint={(id, updater) => setDraft((prev) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp) => cp.id === id ? updater(cp) : cp),
      }))}
    />
  );
};

const meta: Meta<typeof PresetOverridesTab> = {
  title: "Studio/Tabs/PresetOverridesTab",
  component: PresetOverridesTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof PresetOverridesTab>;

export const Default: Story = {};

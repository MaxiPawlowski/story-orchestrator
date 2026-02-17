import type { Meta, StoryObj } from "@storybook/react";
import CheckpointStudio from "./index";
import { mockValidation } from "@components/stories/storybookMocks";

const meta: Meta<typeof CheckpointStudio> = {
  title: "Settings/CheckpointStudio",
  component: CheckpointStudio,
  args: {
    sourceStory: null,
    validate: mockValidation,
    libraryEntries: [
      { key: "story-1", label: "Sun Ruins", kind: "saved", ok: true, story: null, meta: { name: "Sun Ruins" } },
    ] as any,
    selectedKey: "story-1",
    selectedError: null,
    onSelectKey: () => {},
    onSaveStory: async () => ({ ok: true, key: "story-1" } as any),
    onDeleteStory: async () => ({ ok: true, nextSelectedKey: null } as any),
  },
};

export default meta;
type Story = StoryObj<typeof CheckpointStudio>;

export const Default: Story = {};

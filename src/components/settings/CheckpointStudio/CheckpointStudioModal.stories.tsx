import type { Meta, StoryObj } from "@storybook/react";
import CheckpointStudioModal from "./CheckpointStudioModal";
import { mockValidation } from "@components/stories/storybookMocks";

const meta: Meta<typeof CheckpointStudioModal> = {
  title: "Settings/CheckpointStudioModal",
  component: CheckpointStudioModal,
  args: {
    open: true,
    onClose: () => {},
    sourceStory: null,
    validate: mockValidation,
    libraryEntries: [{ key: "story-1", label: "Sun Ruins", kind: "saved", ok: true, story: null, meta: { name: "Sun Ruins" } }] as any,
    selectedKey: "story-1",
    selectedError: null,
    onSelectKey: () => {},
    onSaveStory: async () => ({ ok: true, key: "story-1" } as any),
    onDeleteStory: async () => ({ ok: true, nextSelectedKey: null } as any),
  },
};

export default meta;
type Story = StoryObj<typeof CheckpointStudioModal>;

export const Open: Story = {};

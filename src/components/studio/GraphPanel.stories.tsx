import type { Meta, StoryObj } from "@storybook/react";
import GraphPanel from "./GraphPanel";
import { mockDraft, noop } from "@components/stories/storybookMocks";

const meta: Meta<typeof GraphPanel> = {
  title: "Studio/GraphPanel",
  component: GraphPanel,
  args: {
    draft: mockDraft,
    selectedId: "cp1",
    canAddTransition: true,
    onSelect: noop,
    onAddCheckpoint: noop,
    onAddTransition: noop,
  },
};

export default meta;
type Story = StoryObj<typeof GraphPanel>;

export const Default: Story = {};

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import StoryDetailsPanel from "./StoryDetailsPanel";
import { mockDraft } from "@components/stories/storybookMocks";

const Stateful = () => {
  const [draft, setDraft] = useState(mockDraft);
  return <StoryDetailsPanel draft={draft} setDraft={setDraft} />;
};

const meta: Meta<typeof StoryDetailsPanel> = {
  title: "Studio/StoryDetailsPanel",
  component: StoryDetailsPanel,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof StoryDetailsPanel>;

export const Default: Story = {};

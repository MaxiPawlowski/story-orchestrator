import type { Meta, StoryObj } from "@storybook/react";
import StoryContext from "./StoryContext";
import { mockStoryContextValue } from "@components/stories/storybookMocks";

const Consumer = () => (
  <StoryContext.Consumer>
    {(value) => <div className="text-sm">{value?.title ?? "No story"}</div>}
  </StoryContext.Consumer>
);

const meta: Meta<typeof StoryContext.Provider> = {
  title: "Context/StoryContext",
  component: StoryContext.Provider,
  render: () => (
    <StoryContext.Provider value={mockStoryContextValue}>
      <Consumer />
    </StoryContext.Provider>
  ),
};

export default meta;
type Story = StoryObj<typeof StoryContext.Provider>;

export const Default: Story = {};

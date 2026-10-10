import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import WorkflowMapEditor from "./WorkflowMapEditor";

const meta: Meta<typeof WorkflowMapEditor> = {
  title: "Studio/WorkflowMapEditor",
  component: WorkflowMapEditor,
  args: { value: { portrait: "SO-Portrait.json" }, names: ["Mine.json", "SO-Portrait.json", "Wide.json"], onChange: fn() },
};

export default meta;

type Story = StoryObj<typeof WorkflowMapEditor>;

export const MapsAPictureType: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Portraits workflow")).toHaveValue("SO-Portrait.json");
    await userEvent.click(canvas.getByLabelText("Backgrounds workflow"));
    await userEvent.paste("Wide.json");
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ portrait: "SO-Portrait.json", background: "Wide.json" }));
    await expect(canvas.queryByText(/Not installed here/)).toBeNull();
  },
};

export const ClearingTheLastMappingClearsTheMap: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.clear(within(canvasElement).getByLabelText("Portraits workflow"));
    await expect(args.onChange).toHaveBeenLastCalledWith(undefined);
  },
};

export const WarnsAboutAWorkflowThisInstallLacks: Story = {
  args: { value: { scene: "Painted.json" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Not installed here/)).toBeInTheDocument();
  },
};

export const ListUnavailable: Story = {
  args: { names: null, value: undefined, inherited: "Story default" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/workflow list is not available/)).toBeInTheDocument();
    await expect(canvas.getByLabelText("Scenes workflow")).toHaveAttribute("placeholder", "Story default");
  },
};

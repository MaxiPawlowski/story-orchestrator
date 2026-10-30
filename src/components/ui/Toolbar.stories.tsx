import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { Toolbar } from "./Toolbar";
import { Button } from "./Button";

const meta = { title: "Kit/Toolbar", component: Toolbar } satisfies Meta<typeof Toolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PrimaryEnd: Story = {
  args: {
    label: "Draft actions",
    start: <><Button>Undo</Button><Button>Redo</Button><Button variant="danger">Reset draft</Button></>,
    end: <><Button>Export</Button><Button>Save as</Button><Button variant="primary">Save</Button></>,
  },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("group", { name: "Draft actions" });
    await expect(group.querySelector(".so-toolbar-end")).toHaveTextContent("ExportSave asSave");
  },
};

export const Sticky: Story = { args: { ...PrimaryEnd.args, sticky: true } };

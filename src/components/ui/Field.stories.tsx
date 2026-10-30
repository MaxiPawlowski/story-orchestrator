import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { Select, TextArea, TextInput } from "./Field";

const Demo = () => (
  <div className="so-section">
    <label htmlFor="kit-cadence">Read every … messages</label>
    <TextInput id="kit-cadence" type="number" size="xs" defaultValue={4} />
    <label htmlFor="kit-name">Story title</label>
    <TextInput id="kit-name" size="lg" defaultValue="Factions lab" />
    <label htmlFor="kit-select">Memory model</label>
    <Select id="kit-select" defaultValue="b"><option value="a">Local fast</option><option value="b">Remote</option></Select>
    <label htmlFor="kit-notes">Notes</label>
    <TextArea id="kit-notes" defaultValue="Free text." />
  </div>
);

const meta = { title: "Kit/Field", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cadence = canvas.getByLabelText("Read every … messages");
    await expect(cadence).toHaveClass("text_pole", "so-field");
    await expect(cadence).toHaveAttribute("data-size", "xs");
    await expect(cadence.getBoundingClientRect().width).toBeLessThan(canvas.getByLabelText("Story title").getBoundingClientRect().width);
    await userEvent.clear(canvas.getByLabelText("Story title"));
    await userEvent.type(canvas.getByLabelText("Story title"), "New");
    await expect(canvas.getByLabelText("Story title")).toHaveValue("New");
  },
};

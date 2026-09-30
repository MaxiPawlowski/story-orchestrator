import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { ChapterView } from "@runtime/chapters";
import { PlayerChapters } from "./PlayerChapters";

const view = (patch: Partial<ChapterView> = {}): ChapterView => ({
  declared: true,
  current: { id: "siege", number: 2, playerTitle: "The Siege", interlude: false },
  records: [{ id: "arrival-1", number: 1, playerTitle: "Arrival", short: "They arrived; Kael came away unarmed.", summary: "Mara and Kael reached Harrowgate at dusk.", final: false }],
  ended: false,
  epilogue: null,
  ...patch,
});

const meta: Meta<typeof PlayerChapters> = {
  title: "Drawer/PlayerChapters",
  component: PlayerChapters,
  render: (args) => <div style={{ maxWidth: 360 }}><PlayerChapters {...args} /></div>,
  args: { chapters: view(), onFlag: fn() },
};

export default meta;

type Story = StoryObj<typeof PlayerChapters>;

export const OneChapterEnded: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Your story")).toBeInTheDocument();
    await expect(canvas.getByText("Now: The Siege")).toBeInTheDocument();
    await userEvent.click(canvas.getByText("Arrival"));
    await expect(canvas.getByText("Mara and Kael reached Harrowgate at dusk.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Flag the summary of Arrival" }));
    await expect(args.onFlag).toHaveBeenCalledWith("Arrival");
  },
};

export const StoryEnded: Story = {
  args: { chapters: view({ ended: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("Now: The Siege")).toBeNull();
  },
};

export const WithoutFlag: Story = {
  args: { onFlag: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("button")).toBeNull();
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { CarryPane } from "./CarryPane";
import { carryView } from "./fixtures";

const rows = [
  { chatId: "c1", title: "The Lantern Coast", endingTitle: "The Last Lantern", endedAt: "2026-10-12T10:00:00.000Z" },
  { chatId: "c2", title: "The Lantern Coast", endingTitle: "The Dark Harbour", endedAt: "2026-10-09T10:00:00.000Z" },
];

const actions = (found = rows, pick: () => Promise<{ ok: true } | { ok: false; reason: string }> = async () => ({ ok: true })) => ({
  candidates: fn(async () => found), pick: fn(pick), decline: fn(async () => ({ ok: true as const })), dismiss: fn(async () => ({ ok: true as const })),
});

const meta: Meta<typeof CarryPane> = {
  title: "Carry/CarryPane",
  component: CarryPane,
  render: (args) => <div style={{ maxWidth: 480 }}><CarryPane {...args} /></div>,
  args: { view: carryView({ pending: true, state: null, active: false }), actions: actions() },
};

export default meta;

type Story = StoryObj<typeof CarryPane>;

export const Picker: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/The Lantern Coast — ended with “The Last Lantern”/)).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="carry-run"]')).toHaveLength(2);
    await userEvent.click(canvas.getAllByRole("button", { name: "Continue from this run" })[0]);
    await expect(args.actions.pick).toHaveBeenCalledWith("c1");
    await userEvent.click(canvas.getByRole("button", { name: "Start fresh" }));
    await expect(args.actions.decline).toHaveBeenCalled();
  },
};

export const NoRuns: Story = {
  args: { actions: actions([]) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("No finished run of that story was found in your chats.")).toBeInTheDocument();
  },
};

export const Required: Story = {
  args: { view: carryView({ pending: true, state: null, active: false, required: true }) },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findAllByRole("button", { name: "Continue from this run" });
    await expect(canvasElement.querySelector("#so-carry-fresh")).toBeNull();
  },
};

export const Replay: Story = {
  args: { view: carryView({ pending: true, state: null, active: false, mode: "replay" }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/the story itself starts over/)).toBeInTheDocument();
  },
};

export const Refused: Story = {
  args: { actions: actions(rows, async () => ({ ok: false, reason: "the run has not ended" })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findAllByRole("button", { name: "Continue from this run" }))[0]);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("This run could not be carried");
  },
};

export const Picked: Story = {
  args: { view: carryView() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-carry-picker")).toBeNull();
    await expect(canvasElement.querySelector("#so-carry-heritage")).not.toBeNull();
  },
};

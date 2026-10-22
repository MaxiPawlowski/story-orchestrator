import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { EchoAuthorView } from "@engine/life/echoView";
import { EchoesPanel } from "./EchoesPanel";

const view: EchoAuthorView = {
  rows: [
    { occurrenceId: "e1", echoId: "trader", recipient: "narrator-id", source: "transition market->road#0 at turn 3", state: "waiting", detail: "its when gate does not hold" },
    { occurrenceId: "e2", echoId: "debt", recipient: "mara", source: "quest debt -> failed at turn 5", state: "offered", detail: "reached mara in message 14" },
    { occurrenceId: "e3", echoId: "bell", recipient: "tam", source: "milestone bell at turn 6", state: "expired", detail: "at turn 13" },
  ],
  gaps: [{ from: 1, to: 4, reason: "log" }],
};

const meta: Meta<typeof EchoesPanel> = {
  title: "Drawer/EchoesPanel",
  component: EchoesPanel,
};

export default meta;

type Story = StoryObj<typeof EchoesPanel>;

export const LifecycleRows: Story = {
  args: { view },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Echoes (2 handed over or ended, 1 on the way)"));
    await expect(canvasElement.querySelector('[data-state="waiting"]')).toHaveTextContent("trader → narrator-id: waiting, its when gate does not hold");
    await expect(canvasElement.querySelector('[data-state="offered"]')).toHaveTextContent("reached mara in message 14");
    await expect(canvasElement.querySelector('[data-so="echo-gap"]')).toHaveTextContent("Turns 1–4 were not scanned");
  },
};

export const Empty: Story = {
  args: { view: { rows: [], gaps: [] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="echoes"]')).toBeNull();
  },
};

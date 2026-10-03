import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { defaultPresenceSettings } from "@runtime/displayToggles";
import type { RuntimeSnapshot } from "@runtime/types";
import { PresenceControls } from "./PresenceControls";

const snapshot = (authorView: boolean): RuntimeSnapshot => ({ ui: { authorView, presence: defaultPresenceSettings() } }) as unknown as RuntimeSnapshot;

const meta: Meta<typeof PresenceControls> = {
  title: "Settings/PresenceControls",
  component: PresenceControls,
  args: { onChange: fn() },
};

export default meta;

type Story = StoryObj<typeof PresenceControls>;

export const Player: Story = {
  args: { snapshot: snapshot(false) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-presence-roll-chips")).toBeNull();
    await userEvent.click(canvas.getByLabelText("Mark story groups in the lists"));
    await expect(args.onChange).toHaveBeenCalledWith({ ...defaultPresenceSettings(), listBadges: false });
  },
};

export const Author: Story = {
  args: { snapshot: snapshot(true) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-presence-roll-chips")).not.toBeNull();
    await expect(canvasElement.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { defaultPresenceSettings } from "@runtime/displayToggles";
import type { RuntimeSnapshot } from "@runtime/types";
import { PresenceControls } from "./PresenceControls";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

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

const authorView = { args: { snapshot: snapshot(true) } };
const listBadges = (canvasElement: HTMLElement) => within(canvasElement).getByText("Mark story groups in the lists");

export const Phone: Story = { ...authorView, ...fitsAt(VIEWPORTS.phone, listBadges) };
export const Tablet: Story = { ...authorView, ...fitsAt(VIEWPORTS.tablet, listBadges) };
export const Wide: Story = { ...authorView, ...fitsAt(VIEWPORTS.wide, listBadges) };

export const Author: Story = {
  args: { snapshot: snapshot(true) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-presence-roll-chips")).not.toBeNull();
    await expect(canvasElement.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
  },
};

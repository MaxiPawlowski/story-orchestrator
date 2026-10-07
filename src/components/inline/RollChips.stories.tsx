import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { RollChips } from "./RollChips";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof RollChips> = {
  title: "Inline/RollChips",
  component: RollChips,
  args: {
    messageId: 6,
    rolls: [
      { source: "quality", key: "lock_gives", messageId: 6, boundary: 4, sides: 20, draw: 9, target: 12, outcome: "success", narrate: false },
      { source: "quality", key: "clue_die", messageId: 6, boundary: 4, sides: 6, draw: 3, target: 6, narrate: false },
      { source: "npc", key: "ruins:onEnter:arin:0", messageId: 6, boundary: 4, sides: 100, draw: 71, narrate: false },
      { source: "talk", key: "talk", messageId: 6, boundary: 4, sides: 100, draw: 12, narrate: false },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof RollChips>;

export const AuthorRollChips: Story = {
  play: async ({ canvasElement }) => {
    const chips = [...canvasElement.querySelectorAll<HTMLElement>('[data-so="roll-chip"]')];
    await expect(chips.map((chip) => chip.dataset.source)).toEqual(["quality", "quality", "npc", "talk"]);
    await expect(chips[0].textContent).toContain("d20 9 vs 12, success");
    await expect(chips[0].dataset.outcome).toBe("success");
  },
};

export const NoRolls: Story = {
  args: { rolls: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="roll-chips"]')).toBeNull();
  },
};

const firstChip = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="roll-chip"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, firstChip);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, firstChip);
export const Wide: Story = fitsAt(VIEWPORTS.wide, firstChip);

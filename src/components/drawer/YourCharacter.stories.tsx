import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { PLAYER_SETUP_COPY } from "@features/playerSetupCopy";
import type { RuntimeSnapshot } from "@runtime/types";
import { YourCharacter } from "./YourCharacter";

const snapshot = {
  playerSetup: {
    storyId: "road", pending: false, needsPane: true, player: { role: "a hired courier", summary: "You carry a sealed letter.", assumes: ["can ride"] },
    fixedName: null, current: { avatarId: "max.png", name: "Max" }, personas: [],
    canCreate: true, record: { pending: false, choice: "keep", avatarId: "max.png", name: "Max" }, lockedName: "Max", switched: false, injected: true,
    beforeFirstMessage: false, castClash: null, descriptionEmpty: false, injectOff: false,
  },
} as unknown as RuntimeSnapshot;

const meta: Meta<typeof YourCharacter> = {
  title: "Drawer/YourCharacter",
  component: YourCharacter,
  args: { snapshot },
};

export default meta;

type Story = StoryObj<typeof YourCharacter>;

export const Locked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(PLAYER_SETUP_COPY.yourCharacter));
    await expect(canvas.getByText("Playing as Max.")).toBeVisible();
    await expect(canvasElement.querySelectorAll("button")).toHaveLength(0);
  },
};

export const NoProfile: Story = {
  args: { snapshot: { playerSetup: null } as unknown as RuntimeSnapshot },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-your-character")).toBeNull();
  },
};

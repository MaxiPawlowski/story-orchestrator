import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { getContext } from "@services/STAPI";
import type { RuntimeSnapshot } from "@runtime/types";
import { SETTINGS_ROOT_KEY } from "@runtime/settingsRoot";
import GroupStoryBinding from "./GroupStoryBinding";

const snapshot = (): RuntimeSnapshot =>
  ({
    library: [
      { id: "sun-ruins", title: "The Quest for the Sun Ruins" },
      { id: "harbor", title: "Harbor Night" },
    ],
  }) as unknown as RuntimeSnapshot;

const clearBindings = () => {
  const root = getContext().extensionSettings[SETTINGS_ROOT_KEY] as Record<string, unknown> | undefined;
  if (root) delete root.groupStories;
};

const meta: Meta<typeof GroupStoryBinding> = {
  title: "Settings/GroupStoryBinding",
  component: GroupStoryBinding,
  args: { snapshot: snapshot(), busy: false },
  beforeEach: () => {
    clearBindings();
  },
};

export default meta;

type Story = StoryObj<typeof GroupStoryBinding>;

export const BindsTheOpenGroup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("New chats in g1 start with");
    await expect(select).toHaveValue("");
    await userEvent.selectOptions(select, "harbor");
    await expect(select).toHaveValue("harbor");
    await expect(canvasElement.querySelector("#so-group-story-note")).toHaveAttribute("data-status", "idle");
    await userEvent.selectOptions(select, "");
    await expect(select).toHaveValue("");
  },
};

export const BusyDisablesTheSelect: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("New chats in g1 start with")).toBeDisabled();
  },
};

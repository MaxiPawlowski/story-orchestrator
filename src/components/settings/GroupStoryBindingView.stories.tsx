import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent } from "@storybook/test";
import { GroupStoryBindingView } from "./GroupStoryBindingView";

const library = [{ id: "adolion-saga", title: "The Adolion Saga" }, { id: "adolion-night", title: "Night Market" }];

const meta: Meta<typeof GroupStoryBindingView> = {
  title: "Settings/GroupStoryBindingView",
  component: GroupStoryBindingView,
  args: { groupName: "Adolion - Saga", boundStoryId: null, library, busy: false, status: "idle", onBind: fn() },
};

export default meta;

type Story = StoryObj<typeof GroupStoryBindingView>;

const select = (root: HTMLElement) => root.querySelector<HTMLSelectElement>("#so-group-story-select") as HTMLSelectElement;

export const BindAStory: Story = {
  play: async ({ canvasElement, args }) => {
    await expect(select(canvasElement).value).toBe("");
    await userEvent.selectOptions(select(canvasElement), "adolion-night");
    await expect(args.onBind).toHaveBeenCalledWith("adolion-night");
  },
};

export const ClearABinding: Story = {
  args: { boundStoryId: "adolion-saga", status: "saved" },
  play: async ({ canvasElement, args }) => {
    await expect(select(canvasElement).value).toBe("adolion-saga");
    await expect(canvasElement.querySelector("#so-group-story-note")?.textContent).toContain("Saved.");
    await userEvent.selectOptions(select(canvasElement), "");
    await expect(args.onBind).toHaveBeenCalledWith(null);
  },
};

export const StaleBindingIsNamed: Story = {
  args: { boundStoryId: "adolion-war" },
  play: async ({ canvasElement }) => {
    await expect(select(canvasElement).value).toBe("adolion-war");
    await expect(canvasElement.querySelector("#so-group-story-note")?.textContent).toContain("no longer in the library");
  },
};

export const UnconfirmedSaveSaysWhy: Story = {
  args: { boundStoryId: "adolion-saga", status: "unconfirmed", reason: "the settings save answered 500" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-group-story-note")?.textContent).toContain("answered 500");
  },
};

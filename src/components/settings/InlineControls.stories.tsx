import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { effectiveInlineLevel, type InlineLevel } from "@runtime/settingsModel";
import type { RuntimeSnapshot } from "@runtime/types";
import { InlineControls } from "./InlineControls";

const snapshot = (level: InlineLevel, authorView: boolean): RuntimeSnapshot =>
  ({
    ui: { authorView, inline: { level, categories: {}, window: 20 } },
    inline: { level: effectiveInlineLevel(level, authorView), requested: level, window: 20, categories: {}, newestMessageId: 0, byMessage: {} },
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager => ({ setInlineSettings: fn() }) as unknown as RuntimeManager;

const offered = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((option) => option.value);

const meta: Meta<typeof InlineControls> = {
  title: "Settings/InlineControls",
  component: InlineControls,
};

export default meta;

type Story = StoryObj<typeof InlineControls>;

export const PlayerCapsAStoredAuthorLevel: Story = {
  args: { snapshot: snapshot(4, false), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("Notes under messages");
    await expect(offered(select)).toEqual(["0", "1", "2"]);
    await expect(select).toHaveValue("2");
    await expect((select as HTMLSelectElement).selectedOptions[0]?.textContent).toBe("Behind the scenes");
  },
};

export const AuthorOffersEveryLevel: Story = {
  args: { snapshot: snapshot(4, true), manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("Notes under messages");
    await expect(offered(select)).toEqual(["0", "1", "2", "3", "4"]);
    await expect(select).toHaveValue("4");
    await userEvent.selectOptions(select, "3");
    await expect(args.manager.setInlineSettings).toHaveBeenCalledWith({ level: 3 });
  },
};

export const OffHidesTheFilters: Story = {
  args: { snapshot: snapshot(0, false), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("Notes under messages")).toHaveValue("0");
    await expect(canvasElement.querySelector("[data-so='inline-category']")).toBeNull();
    await expect(canvasElement.querySelector("#so-inline-window")).toBeNull();
  },
};

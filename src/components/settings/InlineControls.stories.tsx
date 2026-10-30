import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { effectiveInlineLevel, type InlineLevel } from "@runtime/settingsModel";
import type { RuntimeSnapshot } from "@runtime/types";
import type { DeviceSettings } from "@runtime/deviceSettings";
import { InlineControls } from "./InlineControls";
import type { DeviceStore } from "./DeviceSetting";

const snapshot = (level: InlineLevel, authorView: boolean): RuntimeSnapshot =>
  ({
    ui: { authorView, inline: { level, categories: {}, window: 20 } },
    inline: { level: effectiveInlineLevel(level, authorView), requested: level, window: 20, categories: {}, newestMessageId: 0, byMessage: {} },
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager => ({ setInlineSettings: fn(), notify: fn() }) as unknown as RuntimeManager;

const memoryStore = (initial: DeviceSettings = {}): DeviceStore & { saved: () => DeviceSettings } => {
  let value: DeviceSettings = { ...initial };
  return {
    read: () => value,
    set: (path, next) => { value = { ...value }; if (next === undefined) delete value[path]; else value[path] = next; return value; },
    saved: () => value,
  };
};

const offered = (group: HTMLElement) => [...group.querySelectorAll<HTMLButtonElement>("[role=radio]")].map((option) => option.dataset.value);
const selected = (group: HTMLElement) => group.querySelector<HTMLButtonElement>("[aria-checked=true]");

const meta: Meta<typeof InlineControls> = {
  title: "Settings/InlineControls",
  component: InlineControls,
};

export default meta;

type Story = StoryObj<typeof InlineControls>;

export const PlayerCapsAStoredAuthorLevel: Story = {
  args: { snapshot: snapshot(4, false), manager: fakeManager(), deviceStore: memoryStore() },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("radiogroup", { name: "Notes under messages" });
    await expect(offered(group)).toEqual(["0", "1", "2"]);
    await expect(selected(group)?.dataset.value).toBe("2");
    await expect(selected(group)?.textContent).toBe("Behind the scenes");
  },
};

export const AuthorOffersEveryLevel: Story = {
  args: { snapshot: snapshot(4, true), manager: fakeManager(), deviceStore: memoryStore() },
  play: async ({ canvasElement, args }) => {
    const group = within(canvasElement).getByRole("radiogroup", { name: "Notes under messages" });
    await expect(offered(group)).toEqual(["0", "1", "2", "3", "4"]);
    await expect(selected(group)?.dataset.value).toBe("4");
    await userEvent.click(within(group).getByRole("radio", { name: "Author" }));
    await expect(args.manager.setInlineSettings).toHaveBeenCalledWith({ level: 3 });
  },
};

export const OffHidesTheFilters: Story = {
  args: { snapshot: snapshot(0, false), manager: fakeManager(), deviceStore: memoryStore() },
  play: async ({ canvasElement }) => {
    await expect(selected(within(canvasElement).getByRole("radiogroup", { name: "Notes under messages" }))?.dataset.value).toBe("0");
    await expect(canvasElement.querySelector("[data-so='inline-category']")).toBeNull();
    await expect(canvasElement.querySelector("#so-inline-window")).toBeNull();
  },
};

const deviceStore = memoryStore();

export const ThisDeviceChipWritesOnlyThisBrowser: Story = {
  args: { snapshot: snapshot(1, false), manager: fakeManager(), deviceStore },
  play: async ({ canvasElement, args }) => {
    const chip = canvasElement.querySelector("#so-device-display-inline-level") as HTMLButtonElement;
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(deviceStore.saved()["display.inline.level"]).toBe(1);
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "Off" }));
    await expect(deviceStore.saved()["display.inline.level"]).toBe(0);
    await expect(args.manager.setInlineSettings).not.toHaveBeenCalled();
    await expect(canvasElement.querySelector("[data-so='setting-scope']")).toHaveTextContent("This device");
  },
};

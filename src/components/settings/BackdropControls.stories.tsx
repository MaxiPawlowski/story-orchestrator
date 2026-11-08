import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { DeviceSettings } from "@runtime/deviceSettings";
import type { BackdropSettings } from "@backdrop/types";
import { defaultBackdropSettings } from "@backdrop/settings";
import { BackdropControls } from "./BackdropControls";
import type { DeviceStore } from "./DeviceSetting";

const memoryStore = (initial: DeviceSettings = {}): DeviceStore => {
  let value: DeviceSettings = { ...initial };
  return { read: () => value, set: (path, next) => { value = { ...value }; if (next === undefined) delete value[path]; else value[path] = next; return value; } };
};

const install = (initial: Partial<BackdropSettings> = {}) => {
  let value: BackdropSettings = { ...defaultBackdropSettings(), ...initial };
  return { readInstall: () => value, writeInstall: fn((patch: Partial<BackdropSettings>) => { value = { ...value, ...patch }; }) };
};

const meta: Meta<typeof BackdropControls> = { title: "Settings/BackdropControls", component: BackdropControls };
export default meta;
type Story = StoryObj<typeof BackdropControls>;

export const AllOn: Story = {
  args: { deviceStore: memoryStore(), notify: fn(), ...install() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const effects = canvasElement.querySelector<HTMLButtonElement>("#so-backdrop-effects");
    await expect(effects?.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(canvas.getByRole("radio", { name: "Full" }));
    await expect(args.writeInstall).toHaveBeenCalledWith({ intensity: 1 });
    await expect(canvas.getByRole("radio", { name: "Full" }).getAttribute("aria-checked")).toBe("true");
  },
};

export const SwitchedOff: Story = {
  args: { deviceStore: memoryStore(), notify: fn(), ...install({ enabled: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector<HTMLButtonElement>("#so-backdrop-effects")?.disabled).toBe(true);
    await expect(canvasElement.querySelector<HTMLButtonElement>("#so-backdrop-enabled")?.getAttribute("aria-checked")).toBe("false");
  },
};

export const DeviceOverride: Story = {
  args: { deviceStore: memoryStore({ "display.backdrop.enabled": false }), notify: fn(), ...install() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-device-display-backdrop-enabled")?.getAttribute("aria-pressed")).toBe("true");
    await expect(canvasElement.querySelector<HTMLButtonElement>("#so-backdrop-enabled")?.getAttribute("aria-checked")).toBe("false");
  },
};

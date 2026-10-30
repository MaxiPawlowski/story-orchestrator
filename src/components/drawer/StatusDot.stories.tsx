import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { StatusDot } from "./StatusDot";

const Rows = () => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-2"><StatusDot tone="ok" label="Persona" word="ready" /></div>
    <div className="flex items-center gap-2"><StatusDot tone="warn" label="Lore" word="1 book missing" /></div>
    <div className="flex items-center gap-2"><StatusDot tone="error" label="Extraction" word="off" /></div>
  </div>
);

const meta: Meta<typeof Rows> = {
  title: "Drawer/StatusDot",
  component: Rows,
};

export default meta;

type Story = StoryObj<typeof Rows>;

export const ToneIconAndWord: Story = {
  play: async ({ canvasElement }) => {
    const dots = [...canvasElement.querySelectorAll<HTMLElement>(".status-indicator")];
    await expect(dots.map((dot) => dot.className)).toEqual([
      "status-indicator status-success", "status-indicator status-warning", "status-indicator status-error",
    ]);
    await expect(dots.map((dot) => dot.querySelector("i")?.className)).toEqual(["fa-solid fa-check", "fa-solid fa-exclamation", "fa-solid fa-xmark"]);
    await expect([...canvasElement.querySelectorAll("[data-so='status-word']")].map((word) => word.textContent)).toEqual(["ready", "1 book missing", "off"]);
    const colours = new Set(dots.map((dot) => getComputedStyle(dot).color));
    await expect(colours.size).toBe(3);
  },
};

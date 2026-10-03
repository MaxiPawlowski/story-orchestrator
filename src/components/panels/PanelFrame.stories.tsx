import type { Meta, StoryObj } from "@storybook/react";
import { expect, fireEvent, fn, userEvent, within } from "@storybook/test";
import { PanelFrame } from "./PanelFrame";

const meta: Meta<typeof PanelFrame> = {
  title: "Panels/PanelFrame",
  component: PanelFrame,
  args: {
    id: "demo",
    title: "Demo panel",
    geometry: { x: 40, y: 40, w: 320, h: 240 },
    onChange: fn(),
    onClose: fn(),
    children: <p>Panel body text.</p>,
  },
};

export default meta;

type Story = StoryObj<typeof PanelFrame>;

const panelOf = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('[data-so="panel"]');

export const Desktop1440: Story = {
  args: { viewport: { width: 1440, height: 900 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const panel = panelOf(canvasElement);
    await expect(panel?.dataset.docked).toBe("false");
    await expect(panel?.style.left).toBe("40px");
    const bar = canvas.getByRole("toolbar");
    bar.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    await expect(panel?.style.left).toBe("56px");
    await expect(panel?.style.top).toBe("56px");
    await expect(args.onChange).toHaveBeenLastCalledWith({ x: 56, y: 56, w: 320, h: 240 });
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 130 });
    fireEvent.pointerUp(window, { clientX: 160, clientY: 130 });
    await expect(args.onChange).toHaveBeenLastCalledWith({ x: 116, y: 86, w: 320, h: 240 });
    const grip = canvasElement.querySelector<HTMLElement>('[data-so="panel-resize"]');
    if (!grip) throw new Error("no resize grip");
    fireEvent.pointerDown(grip, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 480, clientY: 360 });
    fireEvent.pointerUp(window, { clientX: 480, clientY: 360 });
    await expect(args.onChange).toHaveBeenLastCalledWith({ x: 116, y: 86, w: 400, h: 300 });
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const Tablet768: Story = {
  args: { viewport: { width: 768, height: 1024 }, geometry: { x: 700, y: 900, w: 600, h: 400 } },
  play: async ({ canvasElement }) => {
    const panel = panelOf(canvasElement);
    await expect(panel?.dataset.docked).toBe("false");
    await expect(panel?.style.left).toBe("168px");
    await expect(panel?.style.top).toBe("624px");
  },
};

export const Phone390Docked: Story = {
  args: { viewport: { width: 390, height: 844 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const panel = panelOf(canvasElement);
    await expect(panel?.dataset.docked).toBe("true");
    await expect(canvasElement.querySelector('[data-so="panel-resize"]')).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Close Demo panel" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

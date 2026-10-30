import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import ExtensionsBlock, { EXTENSIONS_BLOCK_COPY } from "./ExtensionsBlock";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof ExtensionsBlock> = {
  title: "Settings/ExtensionsBlock",
  component: ExtensionsBlock,
  args: { active: false, onOpenWorkspace: fn(), onOpenSetup: fn() },
};

export default meta;

type Story = StoryObj<typeof ExtensionsBlock>;

export const NativeInlineDrawer: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const drawer = canvasElement.querySelector(".inline-drawer");
    await expect(drawer?.querySelector(":scope > .inline-drawer-toggle.inline-drawer-header b")).toHaveTextContent(EXTENSIONS_BLOCK_COPY.title);
    await expect(drawer?.querySelector(":scope > .inline-drawer-header .inline-drawer-icon")).not.toBeNull();
    await expect(drawer?.querySelector(":scope > .inline-drawer-content #so-open-workspace")).not.toBeNull();
    await expect(canvas.getByText(EXTENSIONS_BLOCK_COPY.idle)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: EXTENSIONS_BLOCK_COPY.open }));
    await expect(args.onOpenWorkspace).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole("button", { name: EXTENSIONS_BLOCK_COPY.setup }));
    await expect(args.onOpenSetup).toHaveBeenCalledTimes(1);
  },
};

export const ButtonsNeverClip: Story = {
  args: { active: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(EXTENSIONS_BLOCK_COPY.active)).toBeInTheDocument();
    await expect(getComputedStyle(canvasElement.querySelector("[data-so='extensions-block']") as HTMLElement).flexDirection).toBe("column");
    for (const id of ["#so-open-workspace", "#so-open-setup"]) {
      const button = canvasElement.querySelector<HTMLElement>(id) as HTMLElement;
      await expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    }
  },
};

export const Phone: Story = {
  ...fitsAt(VIEWPORTS.phone, (canvasElement) => canvasElement.querySelector("#so-open-setup")),
};

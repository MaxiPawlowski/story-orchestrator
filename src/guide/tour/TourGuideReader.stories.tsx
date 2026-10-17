import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { TourGuideReader } from "./TourGuideReader";
import "./tour.css";

const frame: Decorator = (Story) => <div id="so-tour-modal" data-view="player" style={{ position: "static", width: "auto", height: "auto" }}><Story /></div>;

const meta: Meta<typeof TourGuideReader> = {
  title: "Tour/GuideReader", component: TourGuideReader, decorators: [frame],
  args: { doc: "player/playing.md#restart", authorView: false, onClose: fn() },
};
export default meta;
type Story = StoryObj<typeof TourGuideReader>;

export const OpensThePage: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const reader = await page.findByRole("dialog", { name: "Guide" });
    await expect(reader).toHaveAttribute("open");
    await expect(await within(reader).findByRole("heading", { name: "Restart", level: 3 }, { timeout: 8000 })).toBeInTheDocument();
    await userEvent.click(within(reader).getByRole("button", { name: "Close the guide" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const SetupPathPage: Story = {
  args: { doc: "setup/setup-path.md#level-5-feature-defaults" },
  play: async ({ canvasElement }) => {
    const reader = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Guide" });
    await expect(await within(reader).findByRole("heading", { name: "Level 5: feature defaults", level: 3 }, { timeout: 8000 })).toBeInTheDocument();
  },
};

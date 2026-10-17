import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { TourFinder } from "./TourFinder";
import "./tour.css";

const frame: Decorator = (Story) => <div id="so-tour-modal" data-view="setup" style={{ position: "static", width: "auto", height: "auto" }}><Story /></div>;

const meta: Meta<typeof TourFinder> = { title: "Tour/Finder", component: TourFinder, decorators: [frame], args: { open: true, onPick: fn(), onClose: fn() } };
export default meta;
type Story = StoryObj<typeof TourFinder>;

export const Search: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const finder = await page.findByRole("dialog", { name: "Find a step" });
    await expect(finder).toHaveAttribute("open");
    await userEvent.type(within(finder).getByRole("searchbox"), "pictures");
    const hits = within(finder).getAllByRole("button").filter((button) => button.getAttribute("data-so") === "tour-finder-item");
    await expect(hits.length).toBeGreaterThan(0);
    await userEvent.click(within(finder).getByRole("button", { name: /An image service/ }));
    await expect(args.onPick).toHaveBeenCalledWith("setup", expect.any(Number));
  },
};

export const NothingFound: Story = {
  play: async ({ canvasElement, args }) => {
    const finder = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Find a step" });
    await userEvent.type(within(finder).getByRole("searchbox"), "qqqqzz");
    await expect(within(finder).getByRole("status")).toHaveTextContent("No step matches. Try a shorter word.");
    await userEvent.click(within(finder).getByRole("button", { name: "Close" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

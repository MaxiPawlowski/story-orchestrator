import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { PeopleTab } from "./PeopleTab";
import { sampleCodex } from "../../codex/codexFixtures";
import { fitsAt, VIEWPORTS } from "../../../../.storybook/fit";

const meta: Meta<typeof PeopleTab> = {
  title: "Panels/Sheet/PeopleTab",
  component: PeopleTab,
  args: { codex: sampleCodex() },
};

export default meta;

type Story = StoryObj<typeof PeopleTab>;

export const PeopleThenPlaces: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("tab", { name: /People/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: /Places/ }));
    await expect(canvas.getByRole("tab", { name: /Places/ })).toHaveAttribute("aria-selected", "true");
    await expect(canvasElement.querySelector('[data-so="codex-places"]')).not.toBeNull();
  },
};

export const OpensOnPlaces: Story = {
  args: { page: "places" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="codex-places"]')).not.toBeNull();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-people");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { SceneView } from "@runtime/gameTypes";
import { HereNowTab } from "./HereNowTab";
import { sceneWidgetLines } from "../../widgets/gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../../.storybook/fit";

const scene = (sceneWidgetLines.body.kind === "scene" ? sceneWidgetLines.body : null) as SceneView;

const meta: Meta<typeof HereNowTab> = {
  title: "Panels/Sheet/HereNowTab",
  component: HereNowTab,
  args: { scene, onPage: fn() },
};

export default meta;

type Story = StoryObj<typeof HereNowTab>;

export const Present: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Kessel boathouse")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="scene-member"]')).toHaveLength(2);
    await expect(canvas.getByText("Toward you: warming to you")).toBeVisible();
    await expect(canvas.getByText("The Ferrymen's Guild of the Lower River: Trusted")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Marla the innkeeper of the long river crossing" }));
    await expect(args.onPage).toHaveBeenCalledWith("Marla the innkeeper of the long river crossing");
  },
};

export const NobodyHere: Story = {
  args: { scene: { location: null, time: null, present: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Nobody else is here.")).toBeVisible();
    await expect(canvasElement.querySelector('[data-so="here-now-empty"]')).not.toBeNull();
  },
};

export const AloneSomewhere: Story = {
  args: { scene: { location: "The empty pier", time: "Day 1, night", present: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("The empty pier")).toBeVisible();
    await expect(canvasElement.querySelector('[data-so="here-now-alone"]')).toHaveTextContent("Nobody else is here.");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-here-now");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);

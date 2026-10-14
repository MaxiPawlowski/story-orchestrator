import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import CardArtView from "./CardArtView";
import { SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";

const png = `data:image/png;base64,${SPRITE_FIXTURE_PNG}`;
const meta: Meta<typeof CardArtView> = { title: "Studio/CardArtView", component: CardArtView, args: { name: "Arin", onPrepare: fn() } };
export default meta;
type Story = StoryObj<typeof meta>;

export const Accepted: Story = { args: { art: { state: "accepted", folder: "Arin", base: png, bust: png, revision: 2, pack: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "Arin, accepted bust" })).toHaveAttribute("loading", "lazy");
    await expect(canvas.getByRole("img", { name: "Arin, accepted base" })).toBeVisible();
    await expect(canvas.getByText("Accepted presentation, revision 2, with reference views.")).toBeVisible();
    await expect(canvas.queryByRole("button")).toBeNull();
  } };
export const Unprepared: Story = { args: { art: { state: "unprepared", folder: "Arin" } }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.queryByRole("img")).toBeNull();
  await userEvent.click(canvas.getByRole("button", { name: "Prepare presentation" }));
  await expect(args.onPrepare).toHaveBeenCalled();
} };
export const NotCreatedYet: Story = { args: { art: { state: "not-installed" } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText(/once this card is created/)).toBeVisible();
  await expect(canvas.queryByRole("button")).toBeNull();
} };
export const CardChanged: Story = { args: { art: { state: "stale", folder: "Arin" } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText(/card changed since its artwork was accepted/)).toBeVisible();
  await expect(canvas.getByRole("button", { name: "Prepare presentation" })).toBeEnabled();
} };
export const NoNavigation: Story = { args: { art: { state: "unprepared", folder: "Arin" }, onPrepare: undefined }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).queryByRole("button")).toBeNull();
} };

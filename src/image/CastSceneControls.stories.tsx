import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, fn } from "@storybook/test";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { RuntimeSnapshot } from "@runtime/types";
import CastSceneControls from "./CastSceneControls";
import { ImageQueue } from "./queue";
import { CastSetupGap, CAST_TWO_REFERENCE_MISSING } from "./castScene";
import { PLAYER_COPY } from "@runtime/narrative";
const meta: Meta<typeof CastSceneControls> = { title: "Images/PreparedCast", component: CastSceneControls, args: {
  manager: {} as RuntimeManager, snapshot: { storyId: "synthetic" } as RuntimeSnapshot, queue: new ImageQueue(),
  members: [{ name: "Synthetic One", folder: "one" }, { name: "Synthetic Two", folder: "two" }, { name: "Synthetic Three", folder: "three" }], render: fn(async () => {}) } };
export default meta;
type Story = StoryObj<typeof meta>;
export const TwoIdentityLimit: Story = { play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText("Illustrate prepared cast"));
  const checks = canvas.getAllByRole("checkbox"); await userEvent.click(checks[0]); await userEvent.click(checks[1]);
  await expect(checks[2]).toBeDisabled(); await userEvent.click(canvas.getByRole("button", { name: "Draw current-look cast" }));
  await expect(args.render).toHaveBeenCalledWith(["one", "two"], "");
} };
export const SetupGapNamedForTheAuthor: Story = { args: { snapshot: { storyId: "synthetic", ui: { authorView: true } } as RuntimeSnapshot,
  render: async () => { throw new CastSetupGap(CAST_TWO_REFERENCE_MISSING); } },
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByText("Illustrate prepared cast"));
    await userEvent.click(canvas.getAllByRole("checkbox")[0]); await userEvent.click(canvas.getByRole("button", { name: "Draw current-look cast" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent("TextEncodeQwenImage21"); } };
export const SetupGapPlainForThePlayer: Story = { args: { render: async () => { throw new CastSetupGap("Synthetic One's visual pack p@0123 was refused.", PLAYER_COPY.castArtChanged); } },
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByText("Illustrate prepared cast"));
    await userEvent.click(canvas.getAllByRole("checkbox")[0]); await userEvent.click(canvas.getByRole("button", { name: "Draw current-look cast" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(PLAYER_COPY.castArtChanged); } };
export const PendingLookRefused: Story = { args: { render: async () => { throw new Error("Pending changed-look source"); } },
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByText("Illustrate prepared cast"));
    await userEvent.click(canvas.getAllByRole("checkbox")[0]); await userEvent.click(canvas.getByRole("button", { name: "Draw current-look cast" }));
    await expect(await canvas.findByRole("alert")).toBeVisible(); } };

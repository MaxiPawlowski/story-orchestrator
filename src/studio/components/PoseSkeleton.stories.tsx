import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import PoseSkeleton from "./PoseSkeleton";
import { shippedPoses } from "../../sprites/poses/library";

const meta: Meta<typeof PoseSkeleton> = { title: "Studio/PoseSkeleton", component: PoseSkeleton, args: { pose: shippedPoses()[0] } };
export default meta;
type Story = StoryObj<typeof PoseSkeleton>;
export const Preview: Story = { play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getByRole("img", { name: /skeleton/i })).toBeVisible();
} };

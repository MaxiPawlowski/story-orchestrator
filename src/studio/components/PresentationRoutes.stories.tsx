import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import PresentationRoutes from "./PresentationRoutes";
export default { title: "Studio/PresentationRoutes", component: PresentationRoutes } satisfies Meta<typeof PresentationRoutes>;
export const UseCases: StoryObj<typeof PresentationRoutes> = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await userEvent.click(canvas.getByText("Visual use-case routes and status"));
  await expect(canvas.getByText(/Pose floors remain unresolved/)).toBeVisible();
  await expect(canvas.getByText(/No measured replacement route/)).toBeVisible();
} };

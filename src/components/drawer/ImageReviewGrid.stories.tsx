import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import { reviewImages } from "../../image/ReviewGrid";
import type { ImageCandidate, ImagePlan } from "../../image/runtime";

const swatch = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="96"><rect width="64" height="96" fill="${color}"/></svg>`)}`;

const candidate = (color: string, seed: number): ImageCandidate => ({ path: swatch(color), seed, width: 64, height: 96 });

const plan = { caption: "The ruined gate at dusk" } as unknown as ImagePlan;

const Review = ({ count }: { count: number }) => {
  useEffect(() => {
    const colors = ["#a33", "#3a3", "#33a", "#aa3"];
    void reviewImages(plan, colors.slice(0, count).map((color, index) => candidate(color, index + 1)), async (index) => candidate("#777", 100 + index));
    return () => {
      document.querySelectorAll("#so-image-review-root > div").forEach((node) => node.remove());
    };
  }, [count]);
  return null;
};

const meta: Meta<typeof Review> = {
  title: "Image/ReviewGrid",
  component: Review,
  args: { count: 3 },
};

export default meta;

type Story = StoryObj<typeof Review>;

export const RedoButtonsAreNamed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("heading", { name: "The ruined gate at dusk" })).toBeInTheDocument();
    const redo = [1, 2, 3].map((number) => canvas.getByRole("button", { name: `Redo image ${number}` }));
    for (const button of redo) await expect(button).toHaveAttribute("type", "button");
    await expect(canvas.getByRole("button", { name: "Choose image 1" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Choose image 2" }));
    await expect(canvas.getByRole("button", { name: "Choose image 2" })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "Choose image 1" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(redo[1]);
    await expect(await canvas.findByText("seed 101")).toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole("button", { name: "Redo image 2" })).toBeEnabled());
  },
};

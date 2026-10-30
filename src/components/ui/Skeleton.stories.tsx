import { lazy } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { Skeleton } from "./Skeleton";
import { Lazy } from "@components/Lazy";

const meta = { title: "Kit/Skeleton", component: Skeleton } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status", { name: "Loading…" })).toHaveAttribute("aria-busy", "true");
    await expect(canvasElement.querySelectorAll(".so-skeleton-line")).toHaveLength(3);
  },
};

const Never = lazy(() => new Promise<{ default: () => null }>(() => undefined));

export const LazyFallback: Story = {
  render: () => <Lazy><Never /></Lazy>,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status", { name: "Loading…" })).toBeInTheDocument();
  },
};

export const QuietLazyShowsNothing: Story = {
  render: () => <div data-so="quiet"><Lazy quiet><Never /></Lazy></div>,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-so=quiet]")?.children).toHaveLength(0);
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { lazyRetry } from "@utils/lazyRetry";
import { Lazy, LAZY_FAILED_TEXT } from "./Lazy";

const Broken = lazyRetry<() => null>(() => Promise.reject(new Error("chunk")));

const Harness = ({ onError, quiet }: { onError?: (error: unknown) => void; quiet?: boolean }) => (
  <Lazy fallback={<span>Loading…</span>} onError={onError} quiet={quiet}><Broken /></Lazy>
);

const meta: Meta<typeof Harness> = {
  title: "Drawer/LazyFailure",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const FailedChunkOffersRetry: Story = {
  args: { onError: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("Couldn't load — reload SillyTavern");
    await expect(LAZY_FAILED_TEXT).toBe("Couldn't load — reload SillyTavern");
    await expect(args.onError).toHaveBeenCalled();
    const retry = canvas.getByRole("button", { name: "Retry" });
    await expect(retry).toHaveAttribute("type", "button");
    await userEvent.click(retry);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(LAZY_FAILED_TEXT);
  },
};

export const QuietFailureRendersNothing: Story = {
  args: { quiet: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.queryByText("Loading…")).toBeNull());
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(canvasElement.textContent).not.toContain(LAZY_FAILED_TEXT);
  },
};

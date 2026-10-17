import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { TourDialog } from "./TourDialog";
import { emptyProgress, memoryProgressStore } from "./tourProgress";
import { VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof TourDialog> = {
  title: "Tour/Dialog",
  component: TourDialog,
  args: { authorView: false, onShow: fn(), onClose: fn(), reader: (doc: string) => <p data-so="reader-stub">Guide page {doc}</p> },
  render: (args) => <TourDialog {...args} store={memoryProgressStore()} />,
};

export default meta;
type Story = StoryObj<typeof TourDialog>;

const body = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

export const Player: Story = {
  play: async ({ canvasElement, args }) => {
    const page = body(canvasElement);
    const dialog = await page.findByRole("dialog", { name: "Story Orchestrator tour" });
    await expect(dialog).toHaveAttribute("open");
    await expect(dialog).toHaveAttribute("data-view", "player");
    await expect(page.getByRole("heading", { name: "Set up once" })).toBeInTheDocument();
    await expect(page.getByRole("button", { name: "Player" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(page.getByRole("checkbox", { name: "I tried this in SillyTavern" }));
    await expect(page.getByText("1 of 9 tried")).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Next" }));
    await expect(page.getByRole("heading", { name: "Start a story" })).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Back" }));
    await userEvent.click(page.getByRole("button", { name: "Show me" }));
    await expect(args.onShow).toHaveBeenCalledWith({ context: "orchestrator", page: "connections", control: "so-extraction-profile" });
    await userEvent.click(page.getByRole("button", { name: "Close the tour" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const SetupPath: Story = {
  args: { initialView: "setup" },
  play: async ({ canvasElement, args }) => {
    const page = body(canvasElement);
    const dialog = await page.findByRole("dialog", { name: "Story Orchestrator tour" });
    await expect(dialog).toHaveAttribute("data-view", "setup");
    await expect(page.getByText("Level 0 · Step 1 of 26")).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: /Memory\s*$/ }));
    await expect(page.getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Open this setting: Story reading" }));
    await expect(args.onShow).toHaveBeenCalledWith({ context: "orchestrator", page: "defaults", feature: "reading", control: "so-feature-reading-enabled" });
    await userEvent.click(page.getByRole("button", { name: /The memory model/ }));
    await userEvent.click(page.getByRole("button", { name: "Open this setting" }));
    await expect(args.onShow).toHaveBeenLastCalledWith({ context: "orchestrator", page: "connections", control: "so-extraction-profile" });
  },
};

export const ReadMoreOpensTheGuide: Story = {
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "Story Orchestrator tour" });
    await userEvent.click(page.getByRole("button", { name: "Memory model" }));
    const reader = await page.findByRole("dialog", { name: "Guide" });
    await expect(reader).toHaveAttribute("open");
    await expect(within(reader).getByText("Guide page setup/memory-model.md")).toBeInTheDocument();
    await userEvent.click(within(reader).getByRole("button", { name: "Close the guide" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Guide" })).toBeNull());
    await expect(page.getByRole("dialog", { name: "Story Orchestrator tour" })).toHaveAttribute("open");
  },
};

export const FindAStep: Story = {
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "Story Orchestrator tour" });
    await userEvent.keyboard("/");
    const finder = await page.findByRole("dialog", { name: "Find a step" });
    await waitFor(() => expect(finder).toHaveAttribute("open"));
    await userEvent.type(within(finder).getByRole("searchbox"), "judge key");
    await userEvent.click(within(finder).getByRole("button", { name: /Save the judge key/ }));
    await expect(await page.findByRole("heading", { name: "Save the judge key" })).toBeInTheDocument();
    await expect(page.getByRole("button", { name: "Setup path" })).toHaveAttribute("aria-pressed", "true");
  },
};

export const RemembersItsPlace: Story = {
  render: (args) => <TourDialog {...args} store={memoryProgressStore({ ...emptyProgress(), view: "author",
    current: { player: 0, author: 2, setup: 0 }, done: { player: [], author: ["author-view"], setup: [] } })} />,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "Story Orchestrator tour" });
    await expect(page.getByRole("heading", { name: "The wizard" })).toBeInTheDocument();
    await expect(page.getByText("1 of 8 tried")).toBeInTheDocument();
  },
};

export const Phone: Story = {
  parameters: { testViewport: VIEWPORTS.phone },
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    const dialog = await page.findByRole("dialog", { name: "Story Orchestrator tour" });
    const doc = canvasElement.ownerDocument.documentElement;
    await expect(dialog.getBoundingClientRect().right).toBeLessThanOrEqual(doc.clientWidth + 1);
    const next = page.getByRole("button", { name: "Next" });
    await expect(next.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
};

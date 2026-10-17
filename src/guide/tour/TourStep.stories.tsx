import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { TourStep } from "./TourStep";
import { stepsOf } from "./tourRoutes";
import "./tour.css";

const frame: Decorator = (Story, context) => (
  <div id="so-tour-modal" data-view={context.parameters.view ?? "player"} style={{ position: "static", width: "auto", height: "auto", padding: "1rem" }}>
    <Story />
  </div>
);

const meta: Meta<typeof TourStep> = {
  title: "Tour/Step",
  component: TourStep,
  decorators: [frame],
  args: { step: stepsOf("player")[3], index: 3, total: 9, done: false, nextTitle: "The story page", onTried: fn(), onBack: fn(), onNext: fn(), onReadMore: fn(), onShow: fn() },
};

export default meta;
type Story = StoryObj<typeof TourStep>;

export const PlayerStep: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Play a turn" })).toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Do this" })).toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "You should see" })).toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "If it looks off" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "The story bar" }));
    await expect(args.onReadMore).toHaveBeenCalledWith("player/drawer-and-hud.md#the-story-bar");
    await expect(canvas.getByRole("button", { name: "Copy: /story guide player/drawer-and-hud" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "I tried this in SillyTavern" }));
    await expect(args.onTried).toHaveBeenCalledWith(true);
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(args.onNext).toHaveBeenCalled();
    await expect(canvas.getByText("Next: The story page")).toBeInTheDocument();
  },
};

export const TermExplained: Story = {
  play: async ({ canvasElement }) => {
    const term = within(canvasElement).getByRole("button", { name: /^turn: The end of a reply/ });
    term.focus();
    await expect(term).toHaveFocus();
    await expect(term).toHaveAttribute("data-def");
  },
};

export const SetupStep: Story = {
  parameters: { view: "setup" },
  args: { step: stepsOf("setup")[4], index: 4, total: 26, nextTitle: "Lore settings" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Level 1 · Step 5 of 26")).toBeInTheDocument();
    await expect(canvas.getByText("What it unlocks")).toBeInTheDocument();
    await expect(canvas.getByText("Up to 400 thinking tokens per reply at medium.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open this setting" }));
    await expect(args.onShow).toHaveBeenCalledWith({ context: "orchestrator", page: "defaults", feature: "thinking", control: "so-feature-thinking-effort" });
  },
};

export const FeatureDefaults: Story = {
  parameters: { view: "setup" },
  args: { step: stepsOf("setup").find((step) => step.id === "defaults-world"), index: 20, total: 26, nextTitle: "Visuals" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "World and lore" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await expect(within(list).getAllByText("Turn it off when:", { exact: false })).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Open this setting: Late lore placement" }));
    await expect(args.onShow).toHaveBeenCalledWith({ context: "orchestrator", page: "defaults", feature: "lateLore", control: "so-feature-lateLore-enabled" });
  },
};

export const LastStep: Story = {
  args: { step: stepsOf("player")[8], index: 8, total: 9, nextTitle: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
    await expect(canvas.getByText("That is the last step.")).toBeInTheDocument();
  },
};

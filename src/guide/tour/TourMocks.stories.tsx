import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { TourMock } from "./TourMocks";
import { stepsOf } from "./tourRoutes";
import "./tour.css";

const frame: Decorator = (Story) => (
  <div id="so-tour-modal" data-view="player" style={{ position: "static", width: "min(40rem, 100%)", height: "auto", padding: "1rem" }}><Story /></div>
);

const meta: Meta<typeof TourMock> = { title: "Tour/Mocks", component: TourMock, decorators: [frame] };
export default meta;
type Story = StoryObj<typeof TourMock>;

const setupStep = (id: string) => stepsOf("setup").find((step) => step.id === id);

export const Settings: Story = {
  args: { mock: "settings" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("fix setup (1)")).toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: /Memory model/ }), "A local model");
    await expect(canvas.getByText("memory model set")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Start the example again" }));
    await expect(canvas.getByText("fix setup (1)")).toBeInTheDocument();
  },
};

export const PlayATurn: Story = {
  args: { mock: "turn" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(canvas.getByText("1 update next turn")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Send" }));
    await expect(canvas.getByText("moved on")).toBeInTheDocument();
    await expect(canvas.getByText("The Flooded Hall · tense")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Swipe the reply" }));
    await expect(canvas.getByText("stepped back")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Send ((brb))" }));
    await expect(canvas.getByText("out of character: not read")).toBeInTheDocument();
  },
};

export const StartPage: Story = {
  args: { mock: "brief" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Choose another persona" }));
    await userEvent.click(canvas.getByRole("button", { name: "Begin" }));
    await expect(canvas.getByText(/Your persona now stays with this chat/)).toBeInTheDocument();
  },
};

export const StoryPage: Story = {
  args: { mock: "story" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "What the story remembers" }));
    await expect(canvas.getByRole("tab", { name: "What the story remembers" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Pin" }));
    await expect(canvas.getAllByText("pinned")).toHaveLength(2);
  },
};

export const Stuck: Story = {
  args: { mock: "stuck" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "What could I do?" }));
    await userEvent.click(canvas.getByRole("button", { name: "Listen at the gate" }));
    await expect(canvas.getAllByText("Listen at the gate").length).toBeGreaterThan(1);
  },
};

export const Flag: Story = {
  args: { mock: "flag" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Send" }));
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Nothing in the story changed.");
  },
};

export const AuthorView: Story = {
  args: { mock: "authorview" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show author view" }));
    await expect(canvas.getByText("Show author view?")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show author view" }));
    await expect(canvas.getByText("trust_guide")).toBeInTheDocument();
  },
};

export const Graph: Story = {
  args: { mock: "graph" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "The Bell Room" }));
    await expect(canvas.getByRole("button", { name: "The Bell Room" })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByText("trust_guide >= 3")).toBeInTheDocument();
  },
};

export const Wizard: Story = {
  args: { mock: "wizard" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(canvas.getByText("applied to draft")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await expect(canvas.getByText("created · read back: stored")).toBeInTheDocument();
  },
};

export const Review: Story = {
  args: { mock: "lore" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Reject" }));
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Rejected. Nothing written.");
  },
};

export const Library: Story = {
  args: { mock: "library" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Keep playing" }));
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(/^Applied to this chat: /);
  },
};

export const Restart: Story = { args: { mock: "restart" } };
export const People: Story = { args: { mock: "people" } };
export const Validation: Story = { args: { mock: "validate" } };
export const StoryFeatures: Story = { args: { mock: "layer" } };
export const NextReply: Story = { args: { mock: "preview" } };
export const Start: Story = {
  args: { mock: "start" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Choose a story" }));
    await expect(within(canvasElement).getByText("check setup (1)")).toBeInTheDocument();
  },
};

export const SettingKey: Story = {
  args: { mock: "setting", setting: setupStep("judge-key")?.setting },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Save key" })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("TypeSafe API key"), "example");
    await userEvent.click(canvas.getByRole("button", { name: "Save key" }));
    await expect(canvas.getByText("Judge ready")).toBeInTheDocument();
    await expect(canvas.getByLabelText("TypeSafe API key")).toHaveValue("");
  },
};

export const SettingToggle: Story = {
  args: { mock: "setting", setting: setupStep("sprites")?.setting },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole("checkbox", { name: "Character stage" });
    await expect(box).toBeChecked();
    await userEvent.click(box);
    await expect(box).not.toBeChecked();
    await expect(canvas.getByText("Off on this install")).toBeInTheDocument();
  },
};

export const Policies: Story = {
  args: { mock: "policies", features: setupStep("defaults-visuals")?.features },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Automatic")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: /Illustrations/ }));
    await expect(canvas.getByText("Off on this install")).toBeInTheDocument();
  },
};

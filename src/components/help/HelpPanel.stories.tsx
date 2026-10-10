import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { FEATURES, visibleFeatures } from "@features/registry";
import { AskBox } from "@components/studio/AskBox";
import { HelpPanel, type HelpGuideTopic } from "./HelpPanel";

const HOME = "https://github.com/MaxiPawlowski/story-orchestrator";

const TOPICS: HelpGuideTopic[] = [
  { id: "tension", title: "Tension", text: "How a turning point declares the tension it aims for.", doc: "author/topics/tension.md" },
  { id: "gates", title: "Gates", text: "What must be true before the story moves on.", doc: "author/topics/gates.md" },
];

const isOn = (feature: { id: string }) => (feature.id === "memory" ? true : feature.id === "chapters" ? false : null);

const meta: Meta<typeof HelpPanel> = {
  title: "Settings/HelpPanel",
  component: HelpPanel,
  args: { features: visibleFeatures(false), isOn, homePage: HOME, onShowMe: fn(), onClose: fn() },
  render: ({ onOpenDoc: _onOpenDoc, ...args }) => <HelpPanel {...args} />,
};

export default meta;

type Story = StoryObj<typeof HelpPanel>;

export const PlayerMode: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="help-feature"][data-audience="author"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="help-guide-topics"]')).toBeNull();
    await expect(canvas.getByText("Playing a story")).toBeInTheDocument();
    const memory = canvasElement.querySelector('[data-so="help-feature"][data-feature="memory"]') as HTMLElement;
    await expect(within(memory).getByText("On")).toBeInTheDocument();
    await expect(within(memory).getByRole("link", { name: "Read more" })).toHaveAttribute("href", `${HOME}/blob/master/docs/guide/player/memory.md`);
    await userEvent.click(within(memory).getByRole("button", { name: "Show me" }));
    await expect(args.onShowMe).toHaveBeenCalledWith(expect.objectContaining({ selector: "#so-extraction-profile", surface: "settings" }));
    await userEvent.click(canvas.getByRole("button", { name: "Close help" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const Search: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Search features"), "sprites");
    const shown = [...canvasElement.querySelectorAll('[data-so="help-feature"]')].map((row) => row.getAttribute("data-feature"));
    await expect(shown).toContain("sprites");
    await expect(shown).not.toContain("memory");
    await userEvent.clear(canvas.getByLabelText("Search features"));
    await userEvent.type(canvas.getByLabelText("Search features"), "zzzz-nothing");
    await expect(canvasElement.querySelector('[data-so="help-empty"]')).not.toBeNull();
  },
};

export const AuthorViewAddsTheRestAndTheGuide: Story = {
  args: { features: FEATURES, guideTopics: TOPICS },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="help-feature"][data-audience="author"]')).not.toBeNull();
    const topic = canvasElement.querySelector('[data-so="help-guide-topic"][data-topic="tension"]') as HTMLElement;
    await userEvent.click(within(topic).getByText("Tension"));
    await expect(within(topic).getByRole("link", { name: "Read more" })).toHaveAttribute("href", `${HOME}/blob/master/docs/guide/author/topics/tension.md`);
  },
};

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };

export const Tablet: Story = { parameters: { testViewport: { width: 768, height: 1024 } } };

export const Wide: Story = { parameters: { testViewport: { width: 1440, height: 900 } } };

export const OpensTheGuide: Story = {
  args: { onOpenDoc: fn() },
  render: (args) => <HelpPanel {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open the guide" }));
    await expect(args.onOpenDoc).toHaveBeenCalledWith();
    const memory = canvasElement.querySelector('[data-so="help-feature"][data-feature="memory"]') as HTMLElement;
    await expect(within(memory).queryByRole("link", { name: "Read more" })).toBeNull();
    await userEvent.click(within(memory).getByRole("button", { name: "Read more" }));
    await expect(args.onOpenDoc).toHaveBeenCalledWith("player/memory.md");
  },
};

const playerAsk = fn(async () => ({
  status: "answered" as const, answer: "Open the drawer's Memory tab and pin the fact.", topics: [{ id: "feature/memory-tab", title: "Memory tab" }],
  showMe: { kind: "feature" as const, target: "memory-tab" },
}));

export const AskBoxForAPlayer: Story = {
  args: { ask: <AskBox persona="player" onAsk={playerAsk} onShowMe={fn()} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ask = canvasElement.querySelector("#so-help-ask") as HTMLElement;
    await expect(ask).toHaveAttribute("data-persona", "player");
    await expect(canvasElement.querySelector('[data-so="help-feature"][data-audience="author"]')).toBeNull();
    await userEvent.type(within(ask).getByLabelText("Your question"), "How do I pin a memory?");
    await userEvent.click(within(ask).getByRole("button", { name: "Ask" }));
    await expect(await canvas.findByText(/pin the fact/)).toBeInTheDocument();
    await expect(within(ask).getByRole("button", { name: "Show me" })).toBeInTheDocument();
  },
};

export const AskBoxForAnAuthor: Story = {
  args: {
    features: FEATURES, guideTopics: TOPICS,
    ask: <AskBox persona="author" onAsk={fn(async () => ({ status: "answered" as const, answer: "Tick Constant.", topics: [], showMe: null }))} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ask = canvasElement.querySelector("#so-help-ask") as HTMLElement;
    await expect(ask).toHaveAttribute("data-persona", "author");
    await userEvent.type(within(ask).getByLabelText("Your question"), "How do I make a lorebook entry always on?");
    await userEvent.click(within(ask).getByRole("button", { name: "Ask" }));
    await expect(await canvas.findByText("Tick Constant.")).toBeInTheDocument();
    await expect(within(ask).queryByRole("button", { name: "Show me" })).toBeNull();
  },
};

export const AskPhone: Story = { args: { ask: <AskBox persona="player" onAsk={playerAsk} /> }, parameters: { testViewport: { width: 390, height: 844 } } };

export const AskTablet: Story = { args: { ask: <AskBox persona="player" onAsk={playerAsk} /> }, parameters: { testViewport: { width: 768, height: 1024 } } };

export const AskWide: Story = { args: { ask: <AskBox persona="author" onAsk={playerAsk} /> }, parameters: { testViewport: { width: 1440, height: 900 } } };

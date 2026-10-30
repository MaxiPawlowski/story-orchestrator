import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { FEATURES, visibleFeatures } from "@features/registry";
import { AskBox } from "@components/studio/AskBox";
import { defaultsWhere } from "@features/where";
import { resolveFeatures } from "@runtime/featureResolve";
import { helpFeatureState, type HelpStateSnapshot } from "@runtime/helpFeatureState";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import type { Feature } from "@features/registry";
import { InlineLegendPanel } from "../inline/InlineLegend";
import { HelpPanel, type HelpGuideTopic } from "./HelpPanel";

const HOME = "https://github.com/MaxiPawlowski/story-orchestrator";

const TOPICS: HelpGuideTopic[] = [
  { id: "tension", title: "Tension", text: "How a turning point declares the tension it aims for.", doc: "author/fields/scenes.md#tension" },
  { id: "gates", title: "Gates", text: "What must be true before the story moves on.", doc: "author/fields/moving-on.md#gates" },
];

const settings = defaultGlobalSettings();
const snapshotOf = (ready: boolean, overrides = {}): HelpStateSnapshot => ({
  ready, features: resolveFeatures(settings, ready ? { features: { pacing: "off" } } : null, ready ? { meanwhile: { acceptMode: "review" } } : {}),
  roleRoutes: [{ role: "inner", label: "Inner voice", profileId: "p", state: "missing", detail: "", effort: "default" }],
  extraction: { settings: { profileId: "p" }, scheduler: { inFlight: false } }, stagecraftScope: ["Book"], stagecraft: { proposals: [] },
  storyDeclares: { commitments: true }, ...overrides,
}) as unknown as HelpStateSnapshot;
const loaded = snapshotOf(true);
const noStory = snapshotOf(false);
const stateOf = (feature: Feature) => helpFeatureState(feature, loaded, settings);
const rowOf = (canvasElement: HTMLElement, id: string) => canvasElement.querySelector(`[data-so="help-feature"][data-feature="${id}"]`) as HTMLElement;

const meta: Meta<typeof HelpPanel> = {
  title: "Settings/HelpPanel",
  component: HelpPanel,
  args: { features: visibleFeatures(false), stateOf, homePage: HOME, onShowMe: fn(), onClose: fn() },
  render: ({ onOpenDoc: _onOpenDoc, ...args }) => <HelpPanel {...args} />,
};

export default meta;

type Story = StoryObj<typeof HelpPanel>;

export const PlayerMode: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="help-feature"][data-audience="author"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="help-guide-topics"]')).toBeNull();
    await expect(canvas.getByRole("heading", { name: "For playing" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll("details")).toHaveLength(0);
    const memory = canvasElement.querySelector('[data-so="help-feature"][data-feature="memory"]') as HTMLElement;
    await expect(within(memory).getByText("Story reading:")).toBeInTheDocument();
    await expect(within(memory).getAllByText("Enabled")).toHaveLength(2);
    await expect(within(memory).getAllByText("Install")).toHaveLength(2);
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
    await expect(canvasElement.querySelector('[data-so="help-feature"][data-feature="sprites"] [data-so="help-what"]')).not.toBeNull();
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
    await expect(within(topic).getByRole("link", { name: "Read more" })).toHaveAttribute("href", `${HOME}/blob/master/docs/guide/author/fields/scenes.md#tension`);
  },
};

export const HostedInAPanelHasNoSecondHeader: Story = {
  args: { hosted: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="help-close"]')).toBeNull();
    await expect(within(canvasElement).queryByText("Help", { selector: "span.font-semibold" })).toBeNull();
    const stories = rowOf(canvasElement, "stories");
    await expect(stories).toHaveTextContent("This chat › Story settings › Story › Story for this chat");
  },
};

export const WhereIsAPlainLine: Story = {
  play: async ({ canvasElement }) => {
    const memory = rowOf(canvasElement, "memory");
    await expect(memory.querySelector('[data-so="help-where"]')).toHaveTextContent(/^Where: /);
    await expect(memory.querySelector('[data-so="help-what"]')).toBeNull();
    const groups = [...canvasElement.querySelectorAll('[data-so="help-group"]')].map((group) => group.getAttribute("data-audience"));
    await expect(groups).toEqual(["player", "setup"]);
  },
};

export const InlineNotesLegend: Story = {
  args: { legend: <InlineLegendPanel level={1} id="help-legend-story" /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const legend = canvasElement.querySelector('[data-so="help-legend"]') as HTMLElement;
    await expect(within(legend).getByRole("heading", { name: "Notes under messages" })).toBeInTheDocument();
    await expect(legend.querySelector('[data-so="inline-legend"]')).not.toBeNull();
    await userEvent.type(canvas.getByLabelText("Search features"), "memory");
    await expect(canvasElement.querySelector('[data-so="help-legend"]')).toBeNull();
  },
};

export const EmptySearch: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByLabelText("Search features"), "zzzz-nothing");
    const empty = canvasElement.querySelector('[data-so="help-empty"]') as HTMLElement;
    await expect(within(empty).getByText("Nothing matches. Try another word.")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="help-feature"]')).toBeNull();
  },
};

export const StandaloneKeepsItsHeader: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="help-close"]')).not.toBeNull();
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

export const TakeTheTour: Story = {
  args: { onTour: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Take the tour" }));
    await expect(args.onTour).toHaveBeenCalled();
  },
};

export const EffectiveStateInThisChat: Story = {
  args: {
    features: FEATURES, onOpenSetup: fn(),
    findingsOf: (feature: Feature) => (feature.id === "models-per-task" ? [{ check: "model-role-outage", text: "The inner voice is not answering." }] : []),
  },
  play: async ({ canvasElement, args }) => {
    const pacing = rowOf(canvasElement, "pacing");
    await expect(within(pacing).getByText("Turned off by this story")).toBeInTheDocument();
    await expect(within(pacing).getByText("Story")).toHaveAttribute("data-so", "help-source");
    const meanwhile = rowOf(canvasElement, "meanwhile-proposals");
    await expect(within(meanwhile).getByText("Review before applying")).toBeInTheDocument();
    await expect(within(meanwhile).getByText("This chat")).toBeInTheDocument();
    await expect(within(meanwhile).getByText("Experimental")).toBeInTheDocument();
    await expect(within(rowOf(canvasElement, "inner-voice")).getByText("Missing setup: choose a model")).toBeInTheDocument();
    await expect(within(rowOf(canvasElement, "npc-commitments")).getByText("In this story")).toBeInTheDocument();
    const models = rowOf(canvasElement, "models-per-task");
    await userEvent.click(within(models).getByRole("button", { name: "Open setup" }));
    await expect(args.onOpenSetup).toHaveBeenCalled();
  },
};

export const NoStoryShowsDefaults: Story = {
  args: {
    features: FEATURES, stateOf: (feature: Feature) => helpFeatureState(feature, noStory, settings), whereOf: (feature: Feature) => defaultsWhere(feature.where),
  },
  play: async ({ canvasElement, args }) => {
    const pacing = rowOf(canvasElement, "pacing");
    await expect(within(pacing).getByText("Default for new stories: on")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("Off in this chat");
    await expect(within(rowOf(canvasElement, "npc-commitments")).getByText("Needs a story")).toBeInTheDocument();
    await userEvent.click(within(pacing).getByRole("button", { name: "Show me" }));
    await expect(args.onShowMe).toHaveBeenCalledWith(expect.objectContaining({ workspace: expect.objectContaining({ context: "orchestrator", page: "features", feature: "pacing" }) }));
  },
};

export const EffectiveStatePhone: Story = { ...EffectiveStateInThisChat, parameters: { testViewport: { width: 390, height: 844 } } };

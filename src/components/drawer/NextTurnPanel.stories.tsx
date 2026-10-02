import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import { buildForeignRows, buildNextTurnCost, buildNextTurnPreview, type NextTurnBudget, type NextTurnSourceBlock, type TokenCount } from "@runtime/nextTurn";
import type { RuntimeSnapshot } from "@runtime/types";
import { bucketView } from "@runtime/promptBuckets";
import { NextTurnPanel } from "./NextTurnPanel";

const OWN: NextTurnSourceBlock[] = [
  { key: "story_orchestrator_pacing", depth: 2, role: 0, value: "Raise the stakes toward the sanctum.", position: 1, hasFilter: false },
  { key: "story_orchestrator_memory_facts", depth: 4, role: 0, value: "The sun-key opens the inner sanctum.", position: 1, hasFilter: false },
];

const FOREIGN: NextTurnSourceBlock[] = [
  { key: "3_vectors", depth: 2, role: 0, value: "Past events:\nThe lighthouse keeper lied about the storm.", position: 1, hasFilter: false },
  { key: "script_inject_mood", depth: 1, role: 1, value: "Keep the tone grim.", position: 1, hasFilter: true },
  { key: "tracker_state", depth: 0, role: 0, value: "hp=12", position: -1, hasFilter: false },
];

const BUDGET: NextTurnBudget = { ok: true, context: 98304, response: 600, prompt: 97704, api: "textgenerationwebui" };

const snapshotWith = (countOf: (value: string) => TokenCount | null, budget: NextTurnBudget | null, foreign: NextTurnSourceBlock[] = []): RuntimeSnapshot => {
  const nextTurn = buildNextTurnPreview(OWN, { draftedMember: null, scene: null, sceneFallback: null, countOf, budget });
  const nextTurnForeign = buildForeignRows(foreign, countOf, budget);
  return { nextTurn, nextTurnForeign, nextTurnCost: buildNextTurnCost(nextTurn, nextTurnForeign, budget, budget?.ok ? budget.prompt : null) } as unknown as RuntimeSnapshot;
};

const host = (value: string): TokenCount => ({ tokens: Math.ceil(value.length / 3), source: "host" });
const estimate = (value: string): TokenCount => ({ tokens: Math.ceil(value.length / 4), source: "estimate" });

const meta: Meta<typeof NextTurnPanel> = {
  title: "Drawer/NextTurnPanel",
  component: NextTurnPanel,
  args: { actions: { clearNote: fn(), rerunScene: fn(async () => {}) }, onOpenOwner: fn() },
};

export default meta;

type Story = StoryObj<typeof NextTurnPanel>;

export const Counting: Story = {
  args: { snapshot: snapshotWith(() => null, BUDGET) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="next-turn-cost"]')).toHaveTextContent("counting…");
    await expect(canvas.getAllByText(/counting…/).length).toBeGreaterThanOrEqual(2);
  },
};

export const HostCounts: Story = {
  args: { snapshot: snapshotWith(host, BUDGET) },
  play: async ({ canvasElement }) => {
    const cost = canvasElement.querySelector('[data-so="next-turn-cost"]');
    await expect(cost).toHaveTextContent("of 97,704 available (max context − response)");
    await expect(cost).not.toHaveTextContent("estimated");
    const tokens = [...canvasElement.querySelectorAll('[data-so="next-turn-tokens"]')].map((node) => node.textContent);
    await expect(tokens.every((text) => /\d+ tokens · \d/.test(text ?? ""))).toBe(true);
  },
};

export const EstimatedCounts: Story = {
  args: { snapshot: snapshotWith(estimate, BUDGET) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="next-turn-cost"]')).toHaveTextContent("some counts estimated");
    await expect(canvasElement.querySelector('[data-so="next-turn-tokens"]')).toHaveTextContent("(estimate)");
  },
};

export const BudgetUnknown: Story = {
  args: { snapshot: snapshotWith(host, { ok: false, reason: "this build exports no getMaxPromptTokens from script.js" }) },
  play: async ({ canvasElement }) => {
    const cost = canvasElement.querySelector('[data-so="next-turn-cost"]');
    await expect(cost).toHaveTextContent("budget unknown");
    await expect(cost).toHaveAttribute("data-budget", "unknown");
    await expect(cost).not.toHaveTextContent(" of 0 ");
  },
};

export const ForeignBlocks: Story = {
  args: { snapshot: snapshotWith(host, BUDGET, FOREIGN) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvasElement.querySelector('[data-so="next-turn-foreign"]') as HTMLElement;
    await expect(group).not.toBeNull();
    await userEvent.click(canvas.getByText(/Other extensions/));
    await expect(group).toHaveTextContent("/inject mood");
    await expect(group).toHaveTextContent("not injected; macro only");
    await expect(group).toHaveTextContent("conditional");
    await expect(group.querySelectorAll("button").length).toBe(0);
  },
};

export const MemoryTrim: Story = {
  args: {
    snapshot: {
      ...snapshotWith(host, BUDGET),
      memoryInjection: {
        fates: {},
        trim: {
          facts: { candidates: 5, injected: 3, dropped: 2, tokensUsed: 380, budget: 400, hostCounted: 3, filtered: 1, highWater: 400 },
          session_details: { candidates: 0, injected: 0, dropped: 0, tokensUsed: 0, budget: 400, hostCounted: 0, filtered: 0, highWater: 0 },
          short_term: { candidates: 0, injected: 0, dropped: 0, tokensUsed: 0, budget: 400, hostCounted: 0, filtered: 0, highWater: 0 },
          scene_history: { candidates: 0, injected: 0, dropped: 0, tokensUsed: 0, budget: 400, hostCounted: 0, filtered: 0, highWater: 0 },
        },
      },
    } as RuntimeSnapshot,
  },
  play: async ({ canvasElement }) => {
    const trim = canvasElement.querySelector('[data-so="next-turn-row"][data-key="story_orchestrator_memory_facts"] [data-so="next-turn-trim"]');
    await expect(trim).toHaveTextContent("3 of 5 rows · 380 of 400 budget tokens · 2 trimmed · 1 held out before the budget");
    await expect(trim).toHaveTextContent("this session's largest 400");
    await expect(canvasElement.querySelector('[data-so="next-turn-row"][data-key="story_orchestrator_pacing"] [data-so="next-turn-trim"]')).toBeNull();
  },
};

const withBuckets = (state: RuntimeSnapshot["nextTurnBuckets"]): RuntimeSnapshot => ({ ...snapshotWith(host, BUDGET), nextTurnBuckets: state }) as RuntimeSnapshot;

export const ChatCompletionBuckets: Story = {
  args: { snapshot: withBuckets(bucketView({ main: 120, charDescription: 300, worldInfoBefore: 40, chatHistory: 2000, summary: 60 }, 2520, 150)) },
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector('[data-so="next-turn-buckets"]');
    await expect(line?.getAttribute("data-state")).toBe("matches");
    await expect(line).toHaveTextContent("Prompt: main 120 · character 300 · world info 40 · chat history 2000 (of which Story Orchestrator 150) · other 60 · of 2520");
  },
};

export const ChatCompletionBucketsDisagree: Story = {
  args: { snapshot: withBuckets(bucketView({ main: 10, chatHistory: 20 }, 40, 90)) },
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector('[data-so="next-turn-buckets"]');
    await expect(line?.getAttribute("data-state")).toBe("mismatch");
    await expect(line).toHaveTextContent("ST reports 40");
    await expect(canvasElement.querySelector('[data-so="next-turn-buckets-tokenizers"]')).not.toBeNull();
  },
};

export const ChatCompletionBucketsUnavailable: Story = {
  args: { snapshot: withBuckets({ unavailable: "the prompt manager has no token counts", quiet: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="next-turn-buckets"]')).toHaveTextContent("the prompt manager has no token counts");
  },
};

export const SealedChaptersFolded: Story = {
  args: { snapshot: { ...snapshotWith(host, BUDGET), nextTurnFold: 42 } as RuntimeSnapshot },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="next-turn-fold"]')).toHaveTextContent("42 earlier messages summarized by the chronicle");
  },
};

export const NothingFolded: Story = {
  args: { snapshot: { ...snapshotWith(host, BUDGET), nextTurnFold: 0 } as RuntimeSnapshot },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="next-turn-fold"]')).toBeNull();
  },
};

export const TextCompletionShowsNoBuckets: Story = {
  args: { snapshot: withBuckets({ unavailable: "the main API is not Chat Completion", quiet: true }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="next-turn-buckets"]')).toBeNull();
  },
};

export const PrivateBlocksPerMember: Story = {
  args: {
    snapshot: (() => {
      const own: NextTurnSourceBlock[] = [...OWN, { key: "story_copilot_nudge", depth: 1, role: 0, value: "A servant of the Queen signals the party.", position: 1 }];
      const privateBlocks: NextTurnSourceBlock[] = [
        { key: "story_orchestrator_epistemic", depth: 4, role: 0, value: "Your private aims: have the party report to you.", target: "Forre" },
        { key: "story_orchestrator_epistemic", depth: 4, role: 0, value: "Your private aims: win the war at Greywater.", target: "Alexander" },
      ];
      const nextTurn = buildNextTurnPreview(own, { draftedMember: null, scene: null, sceneFallback: null, countOf: host, budget: BUDGET, privateBlocks });
      return { nextTurn, nextTurnForeign: [], nextTurnCost: buildNextTurnCost(nextTurn, [], BUDGET, BUDGET.ok ? BUDGET.prompt : null) } as unknown as RuntimeSnapshot;
    })(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/private → Forre/)).toBeInTheDocument();
    await expect(canvas.getByText(/private → Alexander/)).toBeInTheDocument();
    await expect(canvas.getByText(/Your private aims: have the party report to you/)).toBeInTheDocument();
    const nudge = canvasElement.querySelector('[data-key="story_copilot_nudge"]');
    await expect(nudge?.querySelector('[data-so="next-turn-one-turn"]')).not.toBeNull();
    await expect(nudge?.querySelector('[data-so="next-turn-clear"]')).toBeNull();
  },
};

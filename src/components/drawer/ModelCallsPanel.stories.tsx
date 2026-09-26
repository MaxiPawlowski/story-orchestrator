import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import ModelCallsPanel from "./ModelCallsPanel";
import type { ModelCallRow } from "@runtime/modelCalls";

const judgeRow: ModelCallRow = { at: "2026-09-26T10:00:05.000Z", kind: "judge", role: "judge:scene", route: "judge:typesafe:jev-1.13.0", result: "ok", ms: 260, tokens: 316, messageId: 7 };
const fallbackRow: ModelCallRow = { at: "2026-09-26T10:00:04.000Z", kind: "judge", role: "judge:warden", route: null, result: "fallback (timeout)", ms: 4000, tokens: null, messageId: 6 };
const readRow: ModelCallRow = { at: "2026-09-26T10:00:03.000Z", kind: "llm", role: "read:cadence", route: null, result: "2 accepted, 0 rejected", ms: null, tokens: null, messageId: 5 };
const directorRow: ModelCallRow = { at: "2026-09-26T10:00:02.000Z", kind: "llm", role: "director", route: null, result: "Arin", ms: 850, tokens: null, messageId: 4 };

const meta: Meta<typeof ModelCallsPanel> = {
  title: "Drawer/ModelCallsPanel",
  component: ModelCallsPanel,
};

export default meta;

type Story = StoryObj<typeof ModelCallsPanel>;

export const JudgeRoutesAndUnrecordedLlmRoutes: Story = {
  args: { calls: [judgeRow, readRow, directorRow] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("judge:typesafe:jev-1.13.0")).toBeInTheDocument();
    const routes = [...canvasElement.querySelectorAll('[data-so="model-call"][data-kind="llm"] [data-so="model-call-route"]')].map((node) => node.textContent);
    await expect(routes).toEqual(["route not recorded", "route not recorded"]);
  },
};

export const FallbackIsNamed: Story = {
  args: { calls: [fallbackRow] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("fallback (timeout)")).toBeInTheDocument();
    await expect(canvas.getByText("route not recorded")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { calls: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No model calls recorded in this chat yet.")).toBeInTheDocument();
  },
};

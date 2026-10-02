import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RoleRouteView } from "@runtime/roleHealth";
import { RoleProfilesGroup } from "./RoleProfilesGroup";

const route = (
  role: RoleRouteView["role"],
  label: string,
  state: RoleRouteView["state"] = "fallback",
  profileId: string | null = "memory",
  detail = "Same as memory model",
  effort: RoleRouteView["effort"] = "default",
): RoleRouteView => ({ role, label, state, profileId, detail, effort });

const allFallback: RoleRouteView[] = [
  route("read", "Story reads"),
  route("synthesis", "Summaries and canon"),
  route("authoring", "Wizard and road ahead"),
  route("director", "Speaker direction"),
  route("curator", "World Info curator"),
];

const profiles = [{ id: "memory", name: "Memory RunPod", model: "artemis" }, { id: "fast", name: "Fast local", model: "gemma-4-e4b" }];

const meta: Meta<typeof RoleProfilesGroup> = {
  title: "Settings/RoleProfilesGroup",
  component: RoleProfilesGroup,
  args: { authorView: true, routes: allFallback, assigned: {}, profiles, testing: null, onAssign: fn(), onTest: fn(), onEffort: fn(), onHarness: fn(), onFallback: fn(), onOpen: fn() },
};

export default meta;

type Story = StoryObj<typeof RoleProfilesGroup>;

export const SameAsMemoryModel: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Models per task/));
    await expect(canvas.getByText(/Affects every chat/)).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="role-profile"]')).toHaveLength(5);
    await expect(canvasElement.querySelector('[data-so="role-profile-test"]')).toBeNull();
    await userEvent.selectOptions(canvasElement.querySelector("#so-role-profile-director") as HTMLSelectElement, "fast");
    await expect(args.onAssign).toHaveBeenCalledWith("director", "fast");
  },
};

export const RoutedAndFailing: Story = {
  args: {
    assigned: { director: "fast", curator: "gone" },
    routes: allFallback.map((entry) => {
      if (entry.role === "director") return route("director", "Speaker direction", "failed", "fast", "Speaker direction failed its self-test: 1 of 3 director cases answered a usable SPEAKER line");
      if (entry.role === "curator") return route("curator", "World Info curator", "missing", "gone", "The profile chosen for World Info curator no longer exists (ID: gone)");
      return entry;
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Models per task \(2 set\)/));
    const director = canvasElement.querySelector('[data-role="director"]') as HTMLElement;
    await expect(director.dataset.state).toBe("failed");
    await expect(director.textContent).toContain("1 of 3 director cases");
    const curatorSelect = canvasElement.querySelector("#so-role-profile-curator") as HTMLSelectElement;
    await expect(curatorSelect.value).toBe("gone");
    await expect(curatorSelect.selectedOptions[0].textContent).toContain("Missing profile");
    await expect(canvasElement.querySelector('[data-role="curator"] [data-so="role-profile-test"]')).toBeDisabled();
    await userEvent.click(within(director).getByRole("button", { name: "Test Speaker direction" }));
    await expect(args.onTest).toHaveBeenCalledWith("director");
    await userEvent.selectOptions(curatorSelect, "");
    await expect(args.onAssign).toHaveBeenCalledWith("curator", null);
  },
};

export const Testing: Story = {
  args: {
    assigned: { synthesis: "fast" },
    testing: "synthesis",
    routes: allFallback.map((entry) => (entry.role === "synthesis" ? route("synthesis", "Summaries and canon", "untested", "fast", "Summaries and canon: not tested yet") : entry)),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText(/Models per task/));
    await expect(canvasElement.querySelector('[data-role="synthesis"] [data-so="role-profile-test"]')?.textContent).toBe("Testing…");
    await expect(canvasElement.querySelector('[data-role="synthesis"] [data-so="role-profile-state"]')?.textContent).toBe("not tested yet");
  },
};

export const ReasoningEffort: Story = {
  args: {
    routes: allFallback.map((entry) => {
      const tc = "a Text Completion connection sends a raw prompt; reasoning cannot be changed per request";
      const exhausted = "The model spent its whole budget thinking — lower the effort for Speaker direction or raise the budget.";
      if (entry.role === "read") {
        const reasoning = { effort: "off" as const, applied: false, collapsed: false, unsupported: tc, budget: 0, chars: 0, tokens: null };
        return { ...route("read", "Story reads", "fallback", "memory", "Same as memory model", "off"), reasoning };
      }
      if (entry.role === "synthesis") {
        const reasoning = { effort: "medium" as const, applied: true, collapsed: true, unsupported: null, budget: 2048, chars: 812, tokens: null };
        return { ...route("synthesis", "Summaries and canon", "fallback", "memory", "Same as memory model", "medium"), reasoning };
      }
      if (entry.role === "authoring") {
        const reasoning = { effort: "medium" as const, applied: true, collapsed: true, sent: "high", unsupported: null, budget: 2048, chars: 0, tokens: null };
        return { ...route("authoring", "Wizard and road ahead", "fallback", "memory", "Same as memory model", "medium"), reasoning };
      }
      if (entry.role === "director") return route("director", "Speaker direction", "reasoning-exhausted", "memory", exhausted, "high");
      return entry;
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Models per task/));
    const read = canvasElement.querySelector('[data-role="read"]') as HTMLElement;
    await expect((read.querySelector("#so-role-effort-read") as HTMLSelectElement).value).toBe("off");
    await expect(read.querySelector('[data-so="role-reasoning-note"]')?.textContent).toContain("Not applied");
    await expect(canvasElement.querySelector('[data-role="synthesis"] [data-so="role-reasoning-note"]')?.textContent).toContain("only switches thinking on or off");
    await expect(canvasElement.querySelector('[data-role="authoring"] [data-so="role-reasoning-note"]')?.textContent).toContain("has no medium level: it runs as high");
    await expect(canvasElement.querySelector('[data-role="curator"] [data-so="role-reasoning-note"]')).toBeNull();
    const director = canvasElement.querySelector('[data-role="director"]') as HTMLElement;
    await expect(director.dataset.state).toBe("reasoning-exhausted");
    await expect(director.textContent).toContain("lower the effort for Speaker direction");
    await userEvent.selectOptions(canvasElement.querySelector("#so-role-effort-curator") as HTMLSelectElement, "low");
    await expect(args.onEffort).toHaveBeenCalledWith("curator", "low");
  },
};

export const HarnessRoute: Story = {
  args: {
    harnesses: [
      { key: "harness:claude:sonnet", label: "Claude Code · sonnet", vendor: "Anthropic" },
      { key: "harness:opencode:openai/gpt-6-astra", label: "opencode · openai/gpt-6-astra", vendor: "OpenAI" },
    ],
    harnessRoutes: { synthesis: { key: "harness:claude:sonnet", fallback: null } },
    meters: [{ route: "harness:claude:sonnet", calls: 3, ok: 2, failed: 1, fallback: 0, inputTokens: 1200, outputTokens: 90, costUsd: 0 }],
    routes: allFallback.map((entry) => (entry.role === "synthesis"
      ? route("synthesis", "Summaries and canon", "not-logged-in", "harness:claude:sonnet",
        "Summaries and canon: claude is not logged in on the machine running SillyTavern: run `claude` once in a terminal there")
      : entry)),
    onHarness: fn(),
    onFallback: fn(),
    onOpen: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Models per task/));
    await expect(args.onOpen).toHaveBeenCalled();
    const synthesis = canvasElement.querySelector('[data-role="synthesis"]') as HTMLElement;
    await expect((synthesis.querySelector("#so-role-profile-synthesis") as HTMLSelectElement).value).toBe("harness:claude:sonnet");
    await expect(synthesis.querySelector('[data-so="role-egress"]')?.textContent).toContain("to Anthropic via Claude Code · sonnet");
    await expect(synthesis.querySelector('[data-so="role-meter"]')?.textContent).toContain("3 calls this chat (1 failed");
    await expect(synthesis.textContent).toContain("run `claude` once");
    await expect(canvasElement.querySelector('[data-role="read"] [data-so="role-egress"]')).toBeNull();
    await userEvent.selectOptions(synthesis.querySelector("#so-role-fallback-synthesis") as HTMLSelectElement, "fast");
    await expect(args.onFallback).toHaveBeenCalledWith("synthesis", "fast");
    await userEvent.selectOptions(canvasElement.querySelector("#so-role-profile-read") as HTMLSelectElement, "harness:opencode:openai/gpt-6-astra");
    await expect(args.onHarness).toHaveBeenCalledWith("read", "harness:opencode:openai/gpt-6-astra");
    await userEvent.selectOptions(synthesis.querySelector("#so-role-profile-synthesis") as HTMLSelectElement, "memory");
    await expect(args.onHarness).toHaveBeenCalledWith("synthesis", null);
    await expect(args.onAssign).toHaveBeenCalledWith("synthesis", "memory");
  },
};

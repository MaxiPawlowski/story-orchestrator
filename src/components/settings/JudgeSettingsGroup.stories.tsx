import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { defaultJudgeSettings, JUDGE_USE_KEYS, type JudgeSettings } from "@judge/index";
import { JudgeSettingsGroup } from "./JudgeSettingsGroup";
import { required } from "@utils/guards";

const settings = (patch: Partial<JudgeSettings> = {}, uses: Partial<JudgeSettings["uses"]> = {}): JudgeSettings => {
  const base = defaultJudgeSettings();
  const none = Object.fromEntries(JUDGE_USE_KEYS.map((key) => [key, false])) as JudgeSettings["uses"];
  return { ...base, ...patch, uses: { ...none, ...uses } };
};

const ready = { configured: true, keySource: "st-secrets", model: "jev-1.13.0", pluginVersion: "1.0.0" };

const meta: Meta<typeof JudgeSettingsGroup> = {
  title: "Settings/JudgeSettingsGroup",
  component: JudgeSettingsGroup,
  args: {
    settings: settings(),
    status: ready,
    selfTest: { running: false, report: null },
    onChange: fn(),
    onSaveKey: fn(async () => ({ ok: true as const })),
    onRefresh: fn(),
    onRunSelfTest: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof JudgeSettingsGroup>;

export const OnByDefault: Story = {
  args: { settings: defaultJudgeSettings() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const master = canvasElement.querySelector<HTMLInputElement>("#so-judge-enabled");
    await expect(master?.checked).toBe(true);
    const director = canvasElement.querySelector<HTMLInputElement>("#so-judge-use-director");
    await expect(director?.checked).toBe(true);
    await expect(director?.disabled).toBe(false);
    await expect(canvas.getByText(/Nothing is sent while this is off/)).toBeInTheDocument();
    await userEvent.click(master as HTMLInputElement);
    await expect(args.onChange).toHaveBeenCalledWith({ enabled: false });
  },
};

export const MasterOffDisablesEveryUse: Story = {
  args: { settings: { ...defaultJudgeSettings(), enabled: false } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector<HTMLInputElement>("#so-judge-enabled")?.checked).toBe(false);
    await expect(canvasElement.querySelector<HTMLInputElement>("#so-judge-use-director")?.disabled).toBe(true);
  },
};

export const OnlyBuiltUsesAreListed: Story = {
  args: { settings: settings({ enabled: true }) },
  play: async ({ args, canvasElement }) => {
    const rows = [...canvasElement.querySelectorAll<HTMLInputElement>("[id^=so-judge-use-]")];
    await expect(rows.map((row) => row.id)).toEqual([
      "so-judge-use-director",
      "so-judge-use-memory-verify",
      "so-judge-use-memory-pairs",
      "so-judge-use-scene-trigger",
      "so-judge-use-scene-tracker",
      "so-judge-use-lookahead",
      "so-judge-use-lore-select",
      "so-judge-use-typed-extraction",
      "so-judge-use-stall-check",
      "so-judge-use-curator-filter",
      "so-judge-use-expressions",
    ]);
    await expect(JUDGE_USE_KEYS.length).toBeGreaterThan(rows.length);
    await userEvent.click(rows[1]);
    await expect(args.onChange).toHaveBeenCalledWith({ uses: { memoryVerify: true } });
  },
};

export const DependencyBlocksAUse: Story = {
  args: { settings: settings({ enabled: true }), builtUses: ["lookahead", "expansionLookahead"], authorView: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector<HTMLInputElement>("#so-judge-use-expansion-lookahead")?.disabled).toBe(true);
    await expect(canvas.getByText(/Needs "Heading toward \(author view\)" first/)).toBeInTheDocument();
  },
};

export const SavesTheKeyAndClearsTheField: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvasElement.querySelector<HTMLInputElement>("#so-judge-key") as HTMLInputElement;
    await expect(field.type).toBe("password");
    await userEvent.type(field, "sk-live-example");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onSaveKey).toHaveBeenCalledWith("sk-live-example");
    await expect(await canvas.findByText("Saved to SillyTavern secrets.")).toBeInTheDocument();
    await expect(field.value).toBe("");
    await expect(args.onRefresh).toHaveBeenCalled();
  },
};

export const PluginMissing: Story = {
  args: { status: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Server plugin not found/)).toBeInTheDocument();
    await expect(canvasElement.querySelector<HTMLButtonElement>("#so-judge-self-test")?.disabled).toBe(true);
  },
};

export const SelfTestResult: Story = {
  args: {
    selfTest: {
      running: false,
      report: { ranAt: "2026-09-19T10:00:00.000Z", model: "jev-1.13.0", total: 8, right: 7, p50LatencyMs: 262, rows: [] },
    },
  },
  play: async ({ canvasElement }) => {
    const result = canvasElement.querySelector("#so-judge-self-test-result");
    await expect(result?.textContent).toContain("7/8 right");
    await expect(result?.textContent).toContain("p50 262 ms");
  },
};

// v2.2 plan 07: expansion review, prepare-ahead and the variant controls are author-only.
export const AuthorExpansionControls: Story = {
  args: { settings: settings({ enabled: true }), authorView: true },
  play: async ({ args, canvasElement }) => {
    const ids = [...canvasElement.querySelectorAll<HTMLInputElement>("[id^=so-judge-use-]")].map((row) => row.id);
    await expect(ids).toEqual(expect.arrayContaining(["so-judge-use-expansion-critic", "so-judge-use-expansion-lookahead"]));
    const pick = canvasElement.querySelector<HTMLSelectElement>("#so-judge-expansion-pick");
    await expect(pick?.disabled).toBe(true);
    await userEvent.selectOptions(required(canvasElement.querySelector<HTMLSelectElement>("#so-judge-expansion-variants"), "variants select"), "2");
    await expect(args.onChange).toHaveBeenCalledWith({ expansion: { variants: 2 } });
  },
};

export const PlayerSeesNoExpansionControls: Story = {
  args: { settings: settings({ enabled: true }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-judge-use-expansion-critic")).toBeNull();
    await expect(canvasElement.querySelector("#so-judge-expansion-variants")).toBeNull();
  },
};

// v2.3 plan 09. "Enabled" is not "working": a use that is on with nothing behind it says so, in the
// same place the author turned it on.
export const ReadinessNamesWhatIsNotWorking: Story = {
  args: {
    settings: settings({ enabled: true }, { stallCheck: true, expansionLookahead: true }),
    status: ready,
  },
  play: async ({ canvasElement }) => {
    const readiness = canvasElement.querySelector("#so-judge-readiness");
    await expect(readiness?.textContent).toContain(`Prepare ahead: on, but "Heading toward (author view)" is off`);
    await expect(canvasElement.querySelector("#so-judge-use-scene-ooc")).toBeNull();
    await expect(canvasElement.querySelector("#so-judge-use-memory-rerank")).toBeNull();
    await expect(canvasElement.querySelector("#so-judge-readiness-summary")?.textContent).toContain("Stall check 100%");
  },
};

const meter = { calls: 12, cachedCalls: 3, inputTokens: 14230, outputTokens: 240, cost: 0, lastAnsweredModel: "jev-1.13.0" };

// v2.4 plan 07 T24: a rate measured on one model says nothing about another.
export const ReadinessNamesTheModelItWasNotMeasuredOn: Story = {
  args: {
    settings: settings({ enabled: true }, { stallCheck: true }),
    meter: { ...meter, lastAnsweredModel: "jev-1.14.0" },
    wardenEnabled: true,
  },
  play: async ({ canvasElement }) => {
    const readiness = canvasElement.querySelector("#so-judge-readiness");
    await expect(readiness?.textContent).toContain("Stall check: on, but not measured on jev-1.14.0 (measured on jev-1.13.0)");
    await expect(readiness?.textContent).toContain("Continuity warden: on, but not measured on jev-1.14.0");
    await expect(canvasElement.querySelector("#so-judge-readiness-summary")).toBeNull();
  },
};

export const AuthorSeesThisChatsSpend: Story = {
  args: { settings: settings({ enabled: true }), authorView: true, meter },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-judge-meter")?.textContent).toBe("This chat: 12 calls (3 from cache) · 14,230 input / 240 output tokens");
  },
};

export const PlayerSeesNoSpendLine: Story = {
  args: { settings: settings({ enabled: true }), meter },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-judge-meter")).toBeNull();
  },
};

export const ReadinessSilentWhenEverythingIsMeasured: Story = {
  args: { settings: settings({ enabled: true }, { stallCheck: true, memoryVerify: true }), status: ready },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-judge-readiness")).toBeNull();
    await expect(canvasElement.querySelector("#so-judge-readiness-summary")?.textContent).toContain("Check memory before storing 98%");
    await expect(canvasElement.querySelector("#so-judge-readiness-summary")?.textContent).toContain("measured on jev-1.13.0");
    await expect(canvasElement.querySelector("#so-judge-recommended-config")).toBeInTheDocument();
  },
};

export const PrivacyNoticeOncePerProviderThatLeavesTheMachine: Story = {
  args: { settings: settings({ enabled: true }, { director: true }), status: ready },
  play: async ({ args, canvasElement }) => {
    const notice = canvasElement.querySelector("#so-judge-privacy-typesafe");
    await expect(notice?.textContent).toContain("sent to TypeSafe");
    await expect(notice?.querySelector("a")?.getAttribute("href")).toBe("https://typesafe.ai/legal/privacy-policy");
    await expect(canvasElement.querySelector("#so-judge-privacy-llama-logprob")).toBeNull();
    await userEvent.click(required(canvasElement.querySelector<HTMLButtonElement>("#so-judge-privacy-ack-typesafe"), "ack button"));
    await expect(args.onChange).toHaveBeenCalledWith({ noticesSeen: ["typesafe"] });
  },
};

export const AcknowledgedNoticeStaysGone: Story = {
  args: { settings: settings({ enabled: true, noticesSeen: ["typesafe"] }, { director: true }), status: ready },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-judge-privacy-typesafe")).toBeNull();
  },
};

export const RoutedToAnUncalibratedLocalProvider: Story = {
  args: {
    settings: settings({ enabled: true, provider: { ...defaultJudgeSettings().provider, stallCheck: "llama-logprob" } }, { stallCheck: true }),
    status: {
      ...ready,
      providers: {
        typesafe: { configured: true, local: false, host: "api.typesafe.ai" },
        "llama-logprob": { configured: true, local: true, host: "127.0.0.1:8080" },
      },
    },
  },
  play: async ({ args, canvasElement }) => {
    const select = required(canvasElement.querySelector<HTMLSelectElement>("#so-judge-provider-stall-check"), "stall provider select");
    await expect(select.value).toBe("llama-logprob");
    await expect(canvasElement.querySelector("#so-judge-readiness")?.textContent).toContain("not calibrated there");
    await expect(canvasElement.querySelector("#so-judge-local-llama-logprob")?.textContent).toContain("runs on this machine (127.0.0.1:8080)");
    await expect(canvasElement.querySelector("#so-judge-privacy-llama-logprob")).toBeNull();
    await userEvent.selectOptions(required(canvasElement.querySelector<HTMLSelectElement>("#so-judge-provider-memory-verify"), "memory provider select"), "llama-logprob");
    await expect(args.onChange).toHaveBeenCalledWith({ provider: { memoryVerify: "llama-logprob" } });
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect, waitFor } from "@storybook/test";
import type { RuntimeSnapshot } from "@runtime/types";
import { HudStrip } from "./HudStrip";
import { emptyGame } from "../widgets/gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const baseSnapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot =>
  ({
    ready: true,
    activeCheckpointName: "The Ruined Gate",
    narrative: { title: "Quest", headline: "The Ruined Gate", sections: [{ id: "now", label: "Where you are", lines: ["The Ruined Gate"] }], text: "" },
    tension: { level: "tense", smoothed: 0.72, expected: 0.6, hint: null },
    ui: { authorView: false, announceTransitions: true, hudEnabled: true, inline: { level: 1 } },
    pendingDeltas: [],
    pipeline: { state: "idle", text: "Following along.", detail: null, needsSetup: false },
    ...overrides,
  }) as unknown as RuntimeSnapshot;

const meta: Meta<typeof HudStrip> = {
  title: "Drawer/HudStrip",
  component: HudStrip,
  args: { onOpenStory: fn(), onOpenSettings: fn() },
};

export default meta;

type Story = StoryObj<typeof HudStrip>;

export const Default: Story = {
  args: { snapshot: baseSnapshot() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The Ruined Gate")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="hud-tension"]')).toHaveAttribute("title", "tension tense");
    await expect(canvasElement.querySelectorAll('.so-hud-dot[data-on="true"]')).toHaveLength(3);
    await expect(canvasElement.textContent).not.toContain("◈");
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onOpenStory).toHaveBeenCalledTimes(1);
  },
};

export const UnnamedSceneShowsStoryTitle: Story = {
  args: { snapshot: baseSnapshot({ activeCheckpointName: "cp3 ambush",
    narrative: { title: "Quest", headline: "Quest", sections: [{ id: "now", label: "Where you are", lines: ["Quest"] }], text: "" } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Quest")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="hud-author-checkpoint"]')).toBeNull();
    await expect(canvasElement.textContent).not.toContain("cp3 ambush");
  },
};

export const AuthorSeesCheckpointName: Story = {
  args: { snapshot: baseSnapshot({ activeCheckpointName: "cp3 ambush", ui: { authorView: true, announceTransitions: true, hudEnabled: true },
    narrative: { title: "Quest", headline: "Quest", sections: [{ id: "now", label: "Where you are", lines: ["Quest"] }], text: "" } }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="hud-author-checkpoint"]')).toHaveTextContent("cp3 ambush");
  },
};

export const CatchingUp: Story = {
  args: { snapshot: baseSnapshot({ pipeline: { state: "stalled-rechecking", text: "Catching up — re-checking recent scenes.", detail: null, needsSetup: false } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("catching up…"));
    await expect(args.onOpenStory).toHaveBeenCalled();
    await expect(args.onOpenSettings).not.toHaveBeenCalled();
  },
};

export const NeedsSetup: Story = {
  args: { snapshot: baseSnapshot({
    storyId: "quest",
    extraction: { settings: { enabled: true, profileId: null } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    pipeline: { state: "not-configured", text: "Nothing is following the story yet — choose a memory model in the extension settings.", detail: null, needsSetup: true },
  }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-hud-pipeline")).toBeNull();
    const chip = canvas.getByText("fix setup (1)");
    await expect(chip.getAttribute("data-blocks")).toBe("1");
    await expect(chip.getAttribute("title")).toMatch(/1 thing stops the story/);
    await userEvent.click(chip);
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
  },
};

export const PendingDelta: Story = {
  args: { snapshot: baseSnapshot({ pendingDeltas: [{ quality: "luke_decision", value: "accepted", source: "extractor" }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1 update next turn")).toBeInTheDocument();
  },
};

export const OpeningReadingsNotCounted: Story = {
  args: { snapshot: baseSnapshot({ pendingDeltas: [
    { quality: "location", value: "aegis_guild_hall", source: "extractor", opening: true },
    { quality: "party_injuries", value: 0, source: "extractor", opening: true },
    { quality: "party_name", value: "Grey Pennants", source: "extractor" },
  ] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1 update next turn")).toBeInTheDocument();
  },
};

export const NoPendingChipBeforeTheFirstTurn: Story = {
  args: { snapshot: baseSnapshot({ pendingDeltas: [{ quality: "location", value: "aegis_guild_hall", source: "extractor", opening: true }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/next turn/)).toBeNull();
  },
};

export const HiddenWhenDisabled: Story = {
  args: { snapshot: baseSnapshot({ ui: { authorView: false, announceTransitions: true, hudEnabled: false } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const BranchChip: Story = {
  args: { snapshot: baseSnapshot({ ready: false, chatIdentity: { kind: "branch", parentChat: "parent-chat", checkpointName: "The Ruined Gate" } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("You went back: continue from here?"));
    await expect(args.onOpenStory).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelector("#so-hud-main")).toBeNull();
  },
};

export const NoBranchChipForAForeignBlob: Story = {
  args: { snapshot: baseSnapshot({ ready: false, chatIdentity: { kind: "foreign", stampedFor: "another-chat" } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

const playing = {
  storyId: "quest",
  extraction: { settings: { enabled: true, profileId: "p1" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: { lastAppliedBoundary: 3, pendingBoundary: null, lastOutcome: "applied", consecutiveFailures: 0, lastReason: null, lastFailureAt: null },
};

export const SetupAlertForAPlayer: Story = {
  args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const chip = canvas.getByText("check setup (1)");
    await expect(chip.getAttribute("data-degrades")).toBe("1");
    await expect(chip.getAttribute("title")).toMatch(/the model is not thinking/);
    await expect(chip.getAttribute("title")).not.toMatch(/harvest|Inner voice/);
    await userEvent.click(chip);
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
  },
};

export const PipelineChipWinsOverSetupAlert: Story = {
  args: { snapshot: baseSnapshot({ ...playing, secretLeaks: ["Summarize"], pipeline: { state: "catching-up", text: "Catching up after your edit…", detail: null, needsSetup: false } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-hud-setup")).toBeNull();
    await userEvent.click(canvas.getByText("catching up after your edit"));
    await expect(args.onOpenStory).toHaveBeenCalledTimes(1);
  },
};

export const NoSetupAlertWhenNothingIsMissing: Story = {
  args: { snapshot: baseSnapshot(playing) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-setup")).toBeNull();
  },
};

export const ManyFindingsCountBySeverity: Story = {
  args: { snapshot: baseSnapshot({
    ...playing, thinkingSilent: true, secretLeaks: ["Summarize"],
    requirements: { ...playing.requirements, ready: false, missingMembers: ["Belle"], absentMembers: [] },
  }) },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector("#so-hud-setup");
    await expect(chip?.textContent).toBe("fix setup (3)");
    await expect(chip?.getAttribute("data-blocks")).toBe("1");
    await expect(chip?.getAttribute("data-degrades")).toBe("2");
  },
};

export const DismissedFindingLeavesTheChip: Story = {
  args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true, dismissedChecks: ["model-not-thinking"] }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-setup")).toBeNull();
  },
};

export const HiddenWhenNoStory: Story = {
  args: { snapshot: baseSnapshot({ ready: false }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

const DUPLICATE_IDS = { config: { rules: [{ id: "duplicate-id", enabled: false }, { id: "duplicate-id-active", enabled: false }] } };

export const SecretLeakAlertIsTheSameWithAndWithoutAHeldSecret: Story = {
  parameters: { a11y: DUPLICATE_IDS },
  render: (args) => (
    <>
      <div data-arm="held"><HudStrip {...args} snapshot={baseSnapshot({ ...playing, secretLeaks: ["Summarize"], secretsHeld: true })} /></div>
      <div data-arm="unheld"><HudStrip {...args} snapshot={baseSnapshot({ ...playing, secretLeaks: ["Summarize"], secretsHeld: false })} /></div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const arm = (name: string) => canvasElement.querySelector(`[data-arm="${name}"] #so-hud`);
    const chip = (name: string) => arm(name)?.querySelector("#so-hud-setup");
    await expect(chip("held")).not.toBeNull();
    await expect(chip("unheld")).not.toBeNull();
    await expect(arm("held")?.textContent).toBe(arm("unheld")?.textContent);
    await expect(chip("held")?.getAttribute("title")).toBe(chip("unheld")?.getAttribute("title"));
    await expect(chip("held")?.getAttribute("title")).not.toMatch(/held|hiding|unaware/i);
  },
};

const hudButton = (canvasElement: HTMLElement) => canvasElement.querySelector(".so-hud-main");
const crowded = { args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true, pendingDeltas: [{ quality: "luke_decision", value: "accepted", source: "extractor" }] }) } };

export const Phone: Story = { ...crowded, ...fitsAt(VIEWPORTS.phone, hudButton) };
export const Tablet: Story = { ...crowded, ...fitsAt(VIEWPORTS.tablet, hudButton) };
export const Wide: Story = { ...crowded, ...fitsAt(VIEWPORTS.wide, hudButton) };

export const YourMove: Story = {
  args: { snapshot: baseSnapshot({ turn: { yours: true, source: "judge" } }) },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector("#so-hud-turn");
    await expect(chip?.textContent).toBe("Your move.");
    await expect(chip?.getAttribute("title")).not.toMatch(/judge|director|source|decided/i);
  },
};

export const YourMoveAuthor: Story = {
  args: { snapshot: baseSnapshot({ turn: { yours: true, source: "director" }, ui: { authorView: true, announceTransitions: true, hudEnabled: true } }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-turn")?.getAttribute("title")).toMatch(/director/);
  },
};

export const NotYourMove: Story = {
  args: { snapshot: baseSnapshot({ turn: { yours: false, source: null } }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-turn")).toBeNull();
  },
};

const crowdedTurn = { args: { snapshot: baseSnapshot({
  ...playing, thinkingSilent: true, turn: { yours: true, source: "judge" }, pendingDeltas: [{ quality: "luke_decision", value: "accepted", source: "extractor" }],
}) } };

export const YourMovePhone: Story = { ...crowdedTurn, ...fitsAt(VIEWPORTS.phone, hudButton) };

const cardSnapshot = () => baseSnapshot({
  ...playing,
  narrative: { title: "Quest", headline: "The Ruined Gate", sections: [{ id: "now", label: "Where you are", lines: ["The Ruined Gate", "Breach the sanctum."] }], text: "" },
  activeCheckpointId: "cp_gate_internal",
  memory: { entries: [{ id: "secret", text: "Kel hides the key from Arin.", tier: "facts" }] },
  memoryShown: [
    { id: "m1", text: "The sun-key opens the inner sanctum.", tier: "facts", createdAt: 1 },
    { id: "m2", text: "The guild master warned you.", tier: "facts", createdAt: 2, pinned: true },
    { id: "m3", text: "An old claim.", tier: "facts", createdAt: 3, supersededBy: "m1" },
  ],
});

const TABS = [
  { id: "journal" as const, label: "Journal", icon: "fa-book" },
  { id: "ideas" as const, label: "Ideas", icon: "fa-lightbulb" },
  { id: "memory" as const, label: "Memory", icon: "fa-brain" },
];

const cardArgs = () => ({ tabs: TABS, openTab: fn(), onRetry: fn(), setLevel: fn() });

export const StoryCardOpensFromTheStrip: Story = {
  args: { snapshot: cardSnapshot(), card: cardArgs() },
  parameters: { a11y: { element: "#so-hud-root" } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvasElement.querySelector("#so-hud-main") as HTMLButtonElement;
    await expect(main).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(main);
    const card = await canvas.findByRole("dialog", { name: "The Ruined Gate" });
    await expect(main).toHaveAttribute("aria-expanded", "true");
    await expect(args.onOpenStory).not.toHaveBeenCalled();
    await waitFor(() => expect(card.contains(document.activeElement)).toBe(true));
    await expect(within(card).getByText("Breach the sanctum.")).toBeInTheDocument();
    await expect(within(card).getByText(/Following along\./)).toBeInTheDocument();
    await expect(card.textContent).not.toMatch(/cp_gate_internal|boundary/);
    await expect(canvasElement.querySelector("#so-hud-card-peek")).toBeNull();
    await expect(canvasElement.querySelector("#so-hud-card-level")).toBeNull();
    await expect([...card.querySelectorAll('[data-so="hud-card-tab"]')].map((tab) => tab.getAttribute("data-tab"))).toEqual(["journal", "ideas", "memory"]);
    await expect(card.querySelector("#so-hud-card-journal")).not.toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "Journal" }));
    await expect(args.card?.openTab).toHaveBeenCalledWith("journal");
    await expect(canvasElement.querySelector("#so-hud-card")).toBeNull();
    await userEvent.click(main);
    await userEvent.click(await canvas.findByRole("button", { name: "Story window" }));
    await expect(args.onOpenStory).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelector("#so-hud-card")).toBeNull();
  },
};

const noticing = (count: number) => baseSnapshot({
  ...cardSnapshot(),
  game: { ...emptyGame(), observations: [
    ...Array.from({ length: count }, (_, index) => ({ text: `Detail ${index + 1} is there to see.`, boundary: 5, fresh: true })),
    { text: "An older detail.", boundary: 2, fresh: false },
  ] },
});

export const StoryCardNotices: Story = {
  args: { snapshot: noticing(5), card: { ...cardArgs(), tabs: TABS.slice(0, 1) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    await waitFor(() => expect(canvasElement.querySelector("#so-hud-card-notice")).not.toBeNull());
    const notice = canvasElement.querySelector("#so-hud-card-notice") as HTMLElement;
    await expect(within(notice).getByText("You notice:")).toBeInTheDocument();
    await expect(notice.querySelectorAll('[data-so="hud-card-notice-line"]')).toHaveLength(3);
    await expect(within(notice).getByText("and 2 more in the Journal")).toBeInTheDocument();
    await expect(notice.textContent).not.toMatch(/older detail/);
  },
};

export const StoryCardWithoutNotices: Story = {
  args: { snapshot: noticing(0), card: { ...cardArgs(), tabs: TABS.slice(0, 1) } },
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    await within(canvasElement).findByRole("dialog");
    await expect(canvasElement.querySelector("#so-hud-card-notice")).toBeNull();
  },
};

export const StoryCardNoticesOnAPhone: Story = {
  args: { snapshot: noticing(2), card: { ...cardArgs(), tabs: TABS.slice(0, 1) } },
  parameters: { testViewport: VIEWPORTS.phone },
  render: (args) => <div style={{ paddingTop: 480 }}><HudStrip {...args} /><textarea id="send_textarea" aria-label="Chat input" /></div>,
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    await waitFor(() => expect(canvasElement.querySelector("#so-hud-card-notice")).not.toBeNull());
    const notice = canvasElement.querySelector("#so-hud-card-notice") as HTMLElement;
    const box = notice.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
};

export const StoryCardClosesOnEscapeAndOutsideClick: Story = {
  args: { snapshot: cardSnapshot(), card: { ...cardArgs(), tabs: [] } },
  render: (args) => <><button type="button" id="outside" className="menu_button">elsewhere</button><div id="so-hud-root"><HudStrip {...args} /></div></>,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvasElement.querySelector("#so-hud-main") as HTMLButtonElement;
    await userEvent.click(main);
    await canvas.findByRole("dialog");
    await expect(canvas.queryByRole("button", { name: "Journal" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvasElement.querySelector("#so-hud-card")).toBeNull());
    await expect(document.activeElement).toBe(main);
    await userEvent.keyboard("{Enter}");
    await canvas.findByRole("dialog");
    await userEvent.click(canvas.getByRole("button", { name: "elsewhere" }));
    await waitFor(() => expect(canvasElement.querySelector("#so-hud-card")).toBeNull());
    await expect(args.onOpenStory).not.toHaveBeenCalled();
  },
};

export const StoryCardSetupChipStillOpensPlay: Story = {
  args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true }), card: { ...cardArgs(), tabs: [] } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-setup") as HTMLElement);
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelector("#so-hud-card")).toBeNull();
  },
};

export const StoryCardOnAPhone: Story = {
  args: { snapshot: cardSnapshot(), card: cardArgs() },
  parameters: { testViewport: VIEWPORTS.phone },
  render: (args) => <div style={{ paddingTop: 480 }}><HudStrip {...args} /><textarea id="send_textarea" aria-label="Chat input" /></div>,
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    const card = await within(canvasElement).findByRole("dialog");
    const hud = (canvasElement.querySelector("#so-hud") as HTMLElement).getBoundingClientRect();
    const input = (canvasElement.querySelector("#send_textarea") as HTMLElement).getBoundingClientRect();
    const box = card.getBoundingClientRect();
    await expect(box.bottom).toBeLessThanOrEqual(hud.top + 1);
    await expect(box.bottom).toBeLessThanOrEqual(input.top);
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

const stalled = { state: "stalled-rechecking", text: "Reading is taking longer than usual. It keeps going; Try again checks on it.", detail: "read in flight 130 s", needsSetup: false,
  nextAction: "retry", retryable: true };

export const RetryableChipOpensTheCardWithTryAgain: Story = {
  args: { snapshot: baseSnapshot({ ...playing, pipeline: stalled }), card: cardArgs() },
  play: async ({ args, canvasElement }) => {
    const chip = canvasElement.querySelector("#so-hud-pipeline") as HTMLElement;
    await expect(chip).toHaveTextContent("catching up…");
    await userEvent.click(chip);
    const card = await within(canvasElement).findByRole("dialog");
    await expect(args.onOpenStory).not.toHaveBeenCalled();
    await userEvent.click(within(card).getByRole("button", { name: "Try again" }));
    await expect(args.card?.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const WaitingOnAChip: Story = {
  args: { snapshot: baseSnapshot({ ...playing, pipeline: { state: "working", text: "Waiting for a character to finish thinking…", detail: null, needsSetup: false,
    nextAction: "wait", waitingOn: "inner-beat" } }), card: cardArgs() },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector("#so-hud-pipeline") as HTMLElement;
    await expect(chip).toHaveTextContent("waiting for a character");
    await expect(chip).toHaveAttribute("data-waiting-on", "inner-beat");
    await userEvent.click(chip);
    const card = await within(canvasElement).findByRole("dialog");
    await expect(within(card).getByText(/Waiting for a character to finish thinking/)).toBeInTheDocument();
    await expect(within(card).queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

export const SheetButtonToggles: Story = {
  args: { snapshot: baseSnapshot(playing), card: cardArgs(), sheet: { open: false, toggle: fn() } },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Open the story sheet" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    await expect(args.sheet?.toggle).toHaveBeenCalledTimes(1);
  },
};

export const NoSheetButtonWithoutTabs: Story = {
  args: { snapshot: baseSnapshot(playing), card: { ...cardArgs(), tabs: [] }, sheet: { open: false, toggle: fn() } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-sheet")).toBeNull();
  },
};

export const SheetButtonPhone: Story = { args: { snapshot: baseSnapshot({ ...crowdedTurn.args.snapshot }), card: cardArgs(), sheet: { open: false, toggle: fn() } },
  ...fitsAt(VIEWPORTS.phone, hudButton) };

export const StoryCardSkipAhead: Story = {
  args: { snapshot: baseSnapshot({ ...cardSnapshot(), skip: { enabled: true, reason: null } }), card: { ...cardArgs(), tabs: TABS.slice(0, 1), skip: fn() } },
  parameters: { a11y: { element: "#so-hud-root" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    const card = await within(canvasElement).findByRole("dialog");
    const skip = within(card).getByRole("button", { name: "Skip ahead" });
    await expect(skip).toBeEnabled();
    await userEvent.click(skip);
    await expect(args.card?.skip).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelector("#so-hud-card")).toBeNull();
  },
};

export const StoryCardSkipAheadWaits: Story = {
  args: { snapshot: baseSnapshot({ ...cardSnapshot(), skip: { enabled: false, reason: "Wait for the reply to finish, then skip ahead." } }),
    card: { ...cardArgs(), tabs: TABS.slice(0, 1), skip: fn() } },
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    const card = await within(canvasElement).findByRole("dialog");
    const skip = within(card).getByRole("button", { name: "Skip ahead" });
    await expect(skip).toBeDisabled();
    await expect(skip).toHaveAttribute("title", "Wait for the reply to finish, then skip ahead.");
  },
};

export const StoryCardSkipAheadOff: Story = {
  args: { snapshot: baseSnapshot({ ...cardSnapshot(), skip: null }), card: { ...cardArgs(), tabs: TABS.slice(0, 1), skip: fn() } },
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-main") as HTMLElement);
    await within(canvasElement).findByRole("dialog");
    await expect(canvasElement.querySelector("#so-hud-card-skip")).toBeNull();
  },
};

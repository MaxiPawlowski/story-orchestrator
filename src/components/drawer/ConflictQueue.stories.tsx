import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import type { ConflictPair, MemoryEntry } from "@memory/index";
import { legacyProvenance, provenance } from "@memory/provenance";
import ConflictQueue from "./ConflictQueue";
import { MessageJumpProvider } from "./MessageCitation";

const memoryEntry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: "m1",
  tier: "facts",
  text: "Mara's condition is steady",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: ["Mara"],
  confidence: 1,
  activationTriggers: [],
  evidence: "she said so",
  createdAt: 1,
  messageId: 1,
  recallCount: 0,
  ...overrides,
});

const snapshot = (options: { conflicts?: RuntimeSnapshot["memory"]["conflicts"]; entries?: MemoryEntry[]; epistemic?: RuntimeSnapshot["memory"]["epistemic"]; ledger?: RuntimeSnapshot["memory"]["ledger"] } = {}): RuntimeSnapshot => ({
  memory: {
    conflicts: options.conflicts ?? [],
    entries: options.entries ?? [],
    epistemic: options.epistemic ?? [],
    ledger: options.ledger ?? [],
  },
}) as unknown as RuntimeSnapshot;

const pair: ConflictPair = {
  key: "fact:m1:mara|condition",
  detectedAt: "2026-09-21T00:00:00.000Z",
  window: { from: 3, to: 7 },
  sides: [
    { store: "memory", id: "m1", label: "Mara's condition is steady", messageId: 3, confidence: 0.8, provenance: provenance({ source: "extractor", messageId: 3, boundary: 3, pass: "shared-read" }) },
    { store: "ledger", id: "l1", label: "Mara condition = injured", messageId: 7, provenance: provenance({ source: "extractor", messageId: 7, boundary: 4, pass: "shared-read" }) },
  ],
};

const fakeManager = (actions: Record<string, unknown> = {}) => ({ memoryActions: { resolveMemoryConflict: fn(async () => true), lockAsCanon: fn(async () => true), dismissMemoryConflict: fn(async () => true), setMemoryLocked: fn(async () => {}), reconfirmMemoryEntry: fn(async () => true), rereadConflictWindow: fn(async () => true), discardQuarantined: fn(async () => true), ...actions } }) as unknown as RuntimeManager;

const meta: Meta<typeof ConflictQueue> = {
  title: "Drawer/ConflictQueue",
  component: ConflictQueue,
  render: (args) => <div style={{ maxWidth: 360 }}><ConflictQueue {...args} /></div>,
  args: { snapshot: snapshot({ conflicts: [pair] }), manager: fakeManager() },
};

export default meta;

type Story = StoryObj<typeof ConflictQueue>;

export const AConflictWaitsForTheAuthor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Nothing here steers a reply until you decide/)).toBeInTheDocument();
    await expect(canvas.getByText(/Mara condition = injured/)).toBeInTheDocument();
    await expect(canvas.getByText(/Lock as canon/)).toBeInTheDocument();
  },
};

export const KeepingASideDecidesThePair: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const buttons = await canvas.findAllByText("Keep this");
    await userEvent.click(buttons[1]);
    expect(args.manager.memoryActions.resolveMemoryConflict).toHaveBeenCalledWith("fact:m1:mara|condition", "l1");
  },
};

export const LockingAsCanonIsOneDecision: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(/Lock as canon/));
    expect(args.manager.memoryActions.lockAsCanon).toHaveBeenCalledWith("fact:m1:mara|condition", "m1");
  },
};

export const DismissingLetsBothStand: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Dismiss"));
    expect(args.manager.memoryActions.dismissMemoryConflict).toHaveBeenCalledWith("fact:m1:mara|condition");
  },
};

export const RereadingTargetsTheConflictWindow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(/Re-read the window/));
    expect(args.manager.memoryActions.rereadConflictWindow).toHaveBeenCalledWith("fact:m1:mara|condition");
  },
};

export const EachSideNamesWhereItCameFrom: Story = {
  play: async ({ canvasElement }) => {
    const origins = canvasElement.querySelectorAll('[data-so="conflict-origin"]');
    expect(origins).toHaveLength(2);
    expect(origins[0].textContent).toContain("message 3");
    expect(origins[1].textContent).toContain("message 7");
  },
};

// A row hydrated from an old chat carries `legacyProvenance()` — a hydrate-time DEFAULT, not a read.
// The queue has to say so the way the Memory tab does, or the two panels disagree about the same
// envelope; and a legacy envelope's `messageId` is -1, which must not print as "message -1".
export const ALegacySideReadsAsUnknown: Story = {
  args: {
    snapshot: snapshot({
      conflicts: [{
        key: "fact:legacy|condition",
        detectedAt: "2026-09-21T00:00:00.000Z",
        window: null,
        sides: [
          { store: "memory", id: "l1", label: "Mara's condition is steady", provenance: legacyProvenance() },
          { store: "ledger", id: "l2", label: "Mara condition = injured", messageId: 7, provenance: provenance({ source: "extractor", messageId: 7, boundary: 4, pass: "shared-read" }) },
        ],
      }],
    }),
  },
  play: async ({ canvasElement }) => {
    const origins = Array.from(canvasElement.querySelectorAll('[data-so="conflict-origin"]')).map((origin) => origin.textContent ?? "");
    expect(origins[0]).toContain("origin unknown");
    expect(origins.join(" | ")).not.toContain("legacy · hydrate");
    expect(origins.join(" | ")).not.toContain("message -1");
    expect(origins[1]).toContain("extractor · shared-read");
  },
};

export const AQuarantinedRowCanBeReconfirmed: Story = {
  args: {
    snapshot: snapshot({ entries: [memoryEntry({ id: "q1", text: "the ferryman owes the player a crossing", pinned: true, provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 4, pass: "shared-read" }), validity: "source-removed" } })] }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Source removed: the ferryman owes the player a crossing/)).toBeInTheDocument();
    await userEvent.click(await canvas.findByText(/Reconfirm/));
    expect(args.manager.memoryActions.reconfirmMemoryEntry).toHaveBeenCalledWith("q1");
  },
};

// v2.3 plan 05: the queue is a list of decisions, so its order is part of the contract — the pair
// this pass just found is the one at the top, and a quarantined row is not a decision to make about
// a disagreement but a consequence of one, so it sits after them.
export const TheNewestDecisionComesFirstAndQuarantineLast: Story = {
  args: {
    snapshot: snapshot({
      // Deliberately out of order: the component is what sorts them.
      conflicts: [
        { ...pair, key: "older", detectedAt: "2026-09-20T00:00:00.000Z" },
        { ...pair, key: "newer", detectedAt: "2026-09-21T00:00:00.000Z" },
      ],
      entries: [memoryEntry({ id: "q1", text: "the ferryman owes the player a crossing", provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 4, pass: "shared-read" }), validity: "source-removed" } })],
    }),
  },
  play: async ({ canvasElement }) => {
    const order = [...canvasElement.querySelectorAll('[data-so="conflict-pair"], [data-so="quarantined"]')]
      .map((node) => node.getAttribute("data-key") ?? "quarantined");
    await expect(order).toEqual(["newer", "older", "quarantined"]);
  },
};

// v2.3 plan 05: a decision is WRITTEN, not just applied, and the write is the half that can fail. The
// runtime puts a decision it could not write back and answers `false`, so a click that did nothing is
// what the author must not see: the pair is still queued AND the panel says why.
export const ADecisionThatWasNotWrittenSaysSo: Story = {
  args: { manager: fakeManager({ lockAsCanon: fn(async () => false) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="decision-refused"]')).toBeNull();
    await userEvent.click(await canvas.findByText(/Lock as canon/));
    await expect(await canvas.findByText(/Nothing changed: the decision was not written to this chat/)).toBeInTheDocument();
  },
};

// v2.4 plan 02 (seed D): the put-back is per row and compare-and-set, so a row another writer changed
// during the save is left as it is — and the refusal names it rather than implying a clean undo.
export const ARefusalNamesRowsChangedElsewhere: Story = {
  args: { manager: fakeManager({ lockAsCanon: fn(async () => false), lastRefusal: () => ({ putBack: ["fact:m1:mara|condition"], externallyChanged: ["m1"], lapsed: null }) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(/Lock as canon/));
    await expect(await canvas.findByText(/changed elsewhere while it was saving and were left as they are: m1/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="decision-refused"]')?.getAttribute("data-so-outcome")).toBe("externally-changed");
  },
};

// V8: Discard is a decision too. It used to call the stores directly, so a discard whose save was
// lost vanished from the panel and came back on reload with nothing said.
export const ADiscardThatWasNotWrittenSaysSo: Story = {
  args: {
    manager: fakeManager({ discardQuarantined: fn(async () => false) }),
    snapshot: snapshot({ entries: [memoryEntry({ id: "q1", text: "the ferryman owes the player a crossing", provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 4, pass: "shared-read" }), validity: "source-removed" } })] }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /Discard/ }));
    await expect(args.manager.memoryActions.discardQuarantined).toHaveBeenCalledWith("q1");
    await expect(await canvas.findByText(/Nothing changed: the decision was not written to this chat/)).toBeInTheDocument();
  },
};

export const NothingToDecideRendersNothing: Story = {
  args: { snapshot: snapshot({ entries: [memoryEntry({})] }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Needs your decision/)).toBeNull();
  },
};

// A PRIVATE row is quarantined by the same rollback and reaches no prompt for the same reason, so it
// is the same decision — and until 2026-09-21 it was not in this panel at all, which made the promise
// in `activeEpistemic` ("stays in the store so the author can see and reconfirm it") a comment.
const hiddenRow = (overrides: Record<string, unknown> = {}) => ({
  id: "e1", tag: "hiding" as const, subject: "Arin", hiddenFrom: "Ponticius", content: "palmed the guild's petty cash",
  createdAt: 2, messageId: 4, entities: ["Arin"], confidence: 1,
  provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "epistemic" }), validity: "source-removed" as const },
  ...overrides,
});

export const APrivateQuarantinedRowIsTheSameDecision: Story = {
  args: { snapshot: snapshot({ entries: [], epistemic: [hiddenRow()] }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvasElement.querySelector('[data-so="quarantined"][data-so-kind="epistemic"]');
    await expect(row).not.toBeNull();
    await expect(row?.textContent).toContain("Arin hides from Ponticius");
    // It reaches no prompt until the author decides, so both decisions are offered here.
    await userEvent.click(canvas.getByRole("button", { name: /Reconfirm/ }));
    await expect((args.manager as unknown as { memoryActions: { reconfirmMemoryEntry: ReturnType<typeof fn> } }).memoryActions.reconfirmMemoryEntry).toHaveBeenCalledWith("e1");
    await userEvent.click(canvas.getByRole("button", { name: /Discard/ }));
    await expect((args.manager as unknown as { memoryActions: { discardQuarantined: ReturnType<typeof fn> } }).memoryActions.discardQuarantined).toHaveBeenCalledWith("e1");
  },
};

export const APinnedLedgerRowQuarantinedByRollbackIsOffered: Story = {
  args: { snapshot: snapshot({ entries: [], ledger: [{ id: "l1", entity: "Kael", entityType: "character", field: "location", value: "the crypt", createdAt: 2, messageId: 4, pinned: true, provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "ledger" }), validity: "source-removed" as const } }] }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvasElement.querySelector('[data-so="quarantined"][data-so-kind="ledger"]');
    await expect(row?.textContent).toContain("Kael location = the crypt");
    await userEvent.click(canvas.getByRole("button", { name: /Reconfirm/ }));
    await expect((args.manager as unknown as { memoryActions: { reconfirmMemoryEntry: ReturnType<typeof fn> } }).memoryActions.reconfirmMemoryEntry).toHaveBeenCalledWith("l1");
    await userEvent.click(canvas.getByRole("button", { name: /Discard/ }));
    await expect((args.manager as unknown as { memoryActions: { discardQuarantined: ReturnType<typeof fn> } }).memoryActions.discardQuarantined).toHaveBeenCalledWith("l1");
  },
};

export const AConflictedPrivateRowSaysSo: Story = {
  args: { snapshot: snapshot({ entries: [], epistemic: [hiddenRow({ provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "epistemic" }), validity: "conflicted" as const } })] }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="quarantined"]')?.textContent).toContain("Conflicted");
  },
};

const heldPair: ConflictPair = {
  key: "held:seed>claim",
  detectedAt: "2026-09-25T00:00:00.000Z",
  window: { from: 1, to: 1 },
  sides: [
    { store: "memory", id: "seed", label: "The old stone bridge over the river collapsed in the flood and is gone.", standing: true, provenance: provenance({ source: "extractor", messageId: 0, boundary: 0, pass: "shared-read" }) },
    { store: "memory", id: "claim", label: "The old stone bridge over the river is still standing and intact.", messageId: 1, provenance: provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }) },
  ],
};

export const AHeldClaimLeavesTheEstablishedFactStanding: Story = {
  args: { snapshot: snapshot({ conflicts: [heldPair] }), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const standing = await canvas.findAllByText(/Established: still steers replies while you decide/);
    await expect(standing).toHaveLength(1);
    await expect(canvas.getByText(/still standing and intact/)).toBeInTheDocument();
  },
};

// v2.4 plan 08 T19d: in the drawer (author view) a cited message is a /chat-jump button.
const jumpToMessage = fn();

export const ACitedMessageOpensInTheChat: Story = {
  render: (args) => (
    <MessageJumpProvider value={{ enabled: true, index: { chatLength: 10, known: { from: 0, to: 9 }, changed: [7] }, onJump: jumpToMessage }}>
      <div style={{ maxWidth: 360 }}><ConflictQueue {...args} /></div>
    </MessageJumpProvider>
  ),
  play: async ({ canvasElement }) => {
    const buttons = [...canvasElement.querySelectorAll('[data-so="conflict-origin"] [data-so="jump-to-message"]')] as HTMLButtonElement[];
    await expect(buttons.map((button) => button.textContent)).toEqual(["message 3", "message 7 (changed since)"]);
    await userEvent.click(buttons[1]);
    await expect(jumpToMessage).toHaveBeenCalledWith(7);
  },
};

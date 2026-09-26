import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { WiGatingStatus } from "@runtime/worldInfoMode";
import { WorldInfoGatingGroup } from "./WorldInfoGatingGroup";

const status = (overrides: Partial<WiGatingStatus> = {}): WiGatingStatus => ({
  mode: "scan",
  active: true,
  capability: { state: "present", detail: "a probe scan reached the per-chat gating" },
  ledger: { books: 2, entries: 11 },
  drift: [],
  missingKey: [],
  missing: [],
  unreadable: [],
  busy: false,
  ...overrides,
});

const meta: Meta<typeof WorldInfoGatingGroup> = {
  title: "Settings/WorldInfoGatingGroup",
  component: WorldInfoGatingGroup,
  args: { status: null, authorView: false, onChoose: fn(), onRenormalize: fn() },
};

export default meta;

type Story = StoryObj<typeof WorldInfoGatingGroup>;

export const FileWritesByDefault: Story = {
  play: async ({ canvasElement, args }) => {
    const select = canvasElement.querySelector("#so-wi-gating-mode") as HTMLSelectElement;
    await expect(select.value).toBe("file");
    await expect(canvasElement.querySelector('[data-so="wi-ledger"]')).toBeNull();
    await userEvent.selectOptions(select, "scan");
    await expect(args.onChoose).toHaveBeenCalledWith("scan");
  },
};

export const PerChatActive: Story = {
  args: { status: status() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Active · 11 entries rest off in 2 lorebooks/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="wi-drift"]')).toBeNull();
    await userEvent.selectOptions(canvasElement.querySelector("#so-wi-gating-mode") as HTMLSelectElement, "file");
    await expect(args.onChoose).toHaveBeenCalledWith("file");
  },
};

export const DriftCountsOnlyForThePlayer: Story = {
  args: { status: status({ drift: [{ lorebook: "Xentar Checkpoints", comment: "CP4 - Sphinx" }] }) },
  play: async ({ canvasElement }) => {
    const drift = canvasElement.querySelector('[data-so="wi-drift"]');
    await expect(drift?.textContent).toMatch(/1 entry/);
    await expect(drift?.textContent).not.toMatch(/Sphinx/);
  },
};

export const DriftNamesTheEntryAndOffersTheFix: Story = {
  args: { authorView: true, status: status({ drift: [{ lorebook: "Xentar Checkpoints", comment: "CP2 - Scenario" }], missingKey: [{ lorebook: "Xentar Checkpoints", comment: "CP3 - Gate" }] }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Switched on outside the story.*Xentar Checkpoints: CP2 - Scenario/)).toBeInTheDocument();
    await expect(canvas.getByText(/Cannot be switched off per chat: Xentar Checkpoints: CP3 - Gate/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Switch them off again" }));
    await expect(args.onRenormalize).toHaveBeenCalledTimes(1);
  },
};

export const UnavailableSaysWhy: Story = {
  args: { status: status({ active: false, capability: { state: "absent", detail: "this SillyTavern cannot order event listeners (no makeFirst/makeLast)" } }) },
  play: async ({ canvasElement }) => {
    const note = canvasElement.querySelector('[data-so="wi-unavailable"]');
    await expect(note?.textContent).toMatch(/gated by file writes/);
    await expect(note?.textContent).not.toMatch(/spike|T13/);
  },
};

export const BusyLocksTheControl: Story = {
  args: { status: status({ active: false, busy: true, drift: [{ lorebook: "Ruins", comment: "CP1" }] }) },
  play: async ({ canvasElement }) => {
    await expect((canvasElement.querySelector("#so-wi-gating-mode") as HTMLSelectElement).disabled).toBe(true);
    await expect((canvasElement.querySelector("#so-wi-renormalize") as HTMLButtonElement).disabled).toBe(true);
    await expect(within(canvasElement).getByText(/Preparing/)).toBeInTheDocument();
  },
};

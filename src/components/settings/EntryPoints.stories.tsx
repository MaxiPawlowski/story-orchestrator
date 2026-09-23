import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import EntryPoints from "./EntryPoints";
import { createSaveHealth } from "@runtime/saveHealth";
import type { RuntimeSnapshot } from "@runtime/types";

const base = (overrides: Record<string, unknown> = {}): RuntimeSnapshot =>
  ({
    storyId: "sun-ruins",
    library: [{ id: "sun-ruins", title: "The Quest for the Sun Ruins" }],
    extraction: { settings: { enabled: true, profileId: "artemis" } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    ...overrides,
  }) as unknown as RuntimeSnapshot;

const meta: Meta<typeof EntryPoints> = {
  title: "Settings/EntryPoints",
  component: EntryPoints,
  args: { snapshot: base(), busy: false, importOpen: false, onToggleImport: fn(), onNewStory: fn(), onOpenStudio: fn(), onRevealSetting: fn(), onFixWithWizard: fn() },
};

export default meta;

type Story = StoryObj<typeof EntryPoints>;

export const NothingMissing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Continue")).toBeInTheDocument();
    await expect(canvas.getByText('Playing "The Quest for the Sun Ruins".')).toBeInTheDocument();
    await expect(canvas.getByText("Nothing is missing.")).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-so='repair-step']")).toBeNull();
    // The import body is not rendered at all until Start asks for it.
    await expect(canvasElement.querySelector("#so-entry-import")).toBeNull();
  },
};

export const ImportOpens: Story = {
  args: { importOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Hide import" })).toHaveAttribute("aria-expanded", "true");
  },
};

export const RepairRevealsTheSetting: Story = {
  args: {
    snapshot: base({ extraction: { settings: { enabled: true, profileId: null } } }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The story will not advance on its own until this is set.")).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-so='repair-step']")).toHaveAttribute("data-area", "memory-model");
    await userEvent.click(canvas.getByRole("button", { name: "Show me the setting" }));
    await expect(args.onRevealSetting).toHaveBeenCalledWith("so-extraction-profile");
  },
};

export const RepairOffersTheWizardForACast: Story = {
  args: {
    snapshot: base({ requirements: { ready: false, missingPersonas: [], missingMembers: ["Belle", "Dalan"], missingLorebooks: ["Wendhope"] } }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/people who are not in this chat/)).toBeInTheDocument();
    await expect(canvas.getByText("Missing from the group: Belle, Dalan")).toBeInTheDocument();
    // The cast is the step, not the lore behind it.
    await expect(canvasElement.querySelector("[data-so='repair-step']")).toHaveAttribute("data-area", "cast");
    await userEvent.click(canvas.getByRole("button", { name: "Fix with wizard" }));
    await expect(args.onFixWithWizard).toHaveBeenCalled();
    // A persona blocks the story and the wizard cannot create one, so it offers no such button.
    await expect(canvas.queryByRole("button", { name: "Show me the setting" })).toBeNull();
  },
};

export const NoStoryYet: Story = {
  args: { snapshot: base({ storyId: null, extraction: { settings: { enabled: false, profileId: null } } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No story is playing in this chat yet.")).toBeInTheDocument();
    // Start is the task here, not Repair: a chat with no story has nothing to repair.
    await expect(canvas.getByText("Nothing is missing.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "New story (wizard)" })).toBeEnabled();
  },
};

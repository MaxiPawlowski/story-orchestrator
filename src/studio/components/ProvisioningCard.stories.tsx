import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import React from "react";
import ProvisioningCard from "./ProvisioningCard";
import { PreparePresentationContext } from "../presentationNavigation";

const meta: Meta<typeof ProvisioningCard> = {
  title: "Studio/ProvisioningCard",
  component: ProvisioningCard,
  args: {
    onApply: fn(),
    environment: { characterNames: ["Ponticius"], lorebookNames: ["Xentar Checkpoints"], groupNames: ["Xentar"], storyLorebooks: [], ownedLorebooks: [],
      grantedLorebooks: [], castNames: [], personaNames: [] },
    op: { kind: "createCharacterCard", name: "Arin", description: "A guide who knows the ruins." },
  },
};

export default meta;

type Story = StoryObj<typeof ProvisioningCard>;

export const EditBeforeApply: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const description = canvas.getByLabelText("Description");
    await userEvent.clear(description);
    await userEvent.type(description, "A guide who has been inside twice.");
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await expect(args.onApply).toHaveBeenCalledWith(expect.objectContaining({ kind: "createCharacterCard", description: "A guide who has been inside twice." }));
  },
};

// Create-only, at the point of action: renaming the card to something that exists disables Create.
export const RefusesToOverwriteAnExistingCharacter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Ponticius");
    await expect(await canvas.findByText(/never edits yours/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create it" })).toBeDisabled();
  },
};

export const RefusesAGroupMemberFromAnotherStory: Story = {
  args: {
    environment: { characterNames: ["Mira", "Master Orin"], lorebookNames: [], groupNames: [], storyLorebooks: [], ownedLorebooks: [],
      grantedLorebooks: [], castNames: ["Master Orin"], personaNames: [] },
    op: { kind: "createGroup", name: "The Redrawn Kingdom", members: ["Mira", "Master Orin"] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Not in this story's cast: "Mira"/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create it" })).toBeDisabled();
  },
};

export const OnlyWritesIntoTheStorysOwnLorebook: Story = {
  args: { op: { kind: "upsertLorebookEntry", lorebook: "Xentar Checkpoints", comment: "The ruins", keys: ["ruins"], content: "Sunken halls." } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/will not write into it/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create it" })).toBeDisabled();
  },
};

// R8: the write shows what it replaces. A required-but-unowned book is refused; a granted one is
// editable, and then the author sees the existing content beside the replacement before applying.
export const ShowsTheEntryItWouldReplace: Story = {
  args: {
    environment: { characterNames: [], lorebookNames: ["Xentar Checkpoints"], groupNames: [], storyLorebooks: ["Xentar Checkpoints"], ownedLorebooks: ["Xentar Checkpoints"],
      grantedLorebooks: [], castNames: [], personaNames: [] },
    op: { kind: "upsertLorebookEntry", lorebook: "Xentar Checkpoints", comment: "The ruins", keys: ["ruins"], content: "Sunken halls, three days east." },
    existing: { content: "Sunken halls.", keys: ["ruins"], constant: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Replaces the existing entry/)).toBeInTheDocument();
    await expect(canvas.getByLabelText("Current content")).toHaveTextContent("Sunken halls.");
    await expect(canvas.getByLabelText("New content")).toHaveTextContent("Sunken halls, three days east.");
    await expect(canvas.getByRole("button", { name: "Create it" })).toBeEnabled();
  },
};

export const SaysWhenNothingIsThereYet: Story = {
  args: {
    environment: { characterNames: [], lorebookNames: ["Xentar Checkpoints"], groupNames: [], storyLorebooks: ["Xentar Checkpoints"], ownedLorebooks: ["Xentar Checkpoints"],
      grantedLorebooks: [], castNames: [], personaNames: [] },
    op: { kind: "upsertLorebookEntry", lorebook: "Xentar Checkpoints", comment: "The ruins", keys: ["ruins"], content: "Sunken halls." },
    existing: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/Nothing is filed under "The ruins" yet/)).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Current content")).not.toBeInTheDocument();
  },
};

export const AlreadyCreated: Story = {
  args: { applied: true, result: 'Created the character card "Arin".' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Created" })).toBeDisabled();
    await expect(canvas.getByLabelText("Name")).toBeDisabled();
  },
};

export const LoreEntryFeatures: Story = {
  tags: ["lore-features"],
  args: {
    environment: { characterNames: [], lorebookNames: ["SO-Lore"], groupNames: [], storyLorebooks: ["SO-Lore"], ownedLorebooks: ["SO-Lore"],
      grantedLorebooks: [], castNames: [], personaNames: [] },
    op: { kind: "upsertLorebookEntry", lorebook: "SO-Lore", comment: "Quiet room", keys: ["room"], content: "The room is quiet.",
      secondaryKeys: ["fight"], logic: "and-any" },
    existing: null,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const logic = canvas.getByRole("combobox", { name: "Fires when" });
    await expect(logic).toHaveValue("and-any");
    await userEvent.selectOptions(logic, "not-any");
    await userEvent.type(canvas.getByLabelText("Outlet name (placed only where {{outlet::name}} is written)"), "room");
    await userEvent.type(canvas.getByLabelText("Fires only on these generation types"), "normal, swipe");
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await expect(args.onApply).toHaveBeenCalledWith(expect.objectContaining({ secondaryKeys: ["fight"], logic: "not-any", outlet: "room", triggers: ["normal", "swipe"] }));
    await userEvent.selectOptions(logic, "");
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await expect(args.onApply).toHaveBeenLastCalledWith(expect.objectContaining({ logic: undefined }));
    await userEvent.click(canvas.getByLabelText("Always in context"));
    await expect(canvas.getByRole("button", { name: "Create it" })).toBeDisabled();
    await expect(canvas.getByRole("alert")).toHaveTextContent("skips every key check");
  },
};

const prepare = fn();
export const CharacterArtPlaceholder: Story = {
  decorators: [(Story) => <PreparePresentationContext.Provider value={prepare}><Story /></PreparePresentationContext.Provider>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No accepted artwork yet.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Prepare presentation" }));
    await expect(prepare).toHaveBeenCalled();
  },
};

const HARBOUR = {
  format: 2 as const, title: "Harbour", description: "A smuggler's port.", qualities: [], transitions: [], roster: [],
  checkpoints: [
    { id: "start", name: "The Quay", objective: "Meet the harbour master at the customs house.", type: "anchor" as const, start: true },
    { id: "vault", name: "The Vault", objective: "Open the vault.", type: "anchor" as const, effects: { world_info: { enable: { lorebook: "SO-Lore", comments: ["Customs"] } } } },
  ],
};

export const CardNotes: Story = {
  tags: ["harvest-0934"],
  args: { op: { kind: "createCharacterCard", name: "Arin Vale", description: "A guide.", first_mes: "You walk in and Arin looks up." }, context: { draft: HARBOUR, ops: [] } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const notes = canvasElement.querySelector('[data-so="card-notes"]');
    await expect(notes).toHaveTextContent("very short");
    await expect(notes).toHaveTextContent("speak for the player");
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await expect(args.onApply).toHaveBeenCalled();
  },
};

export const ReadBackUnconfirmed: Story = {
  tags: ["harvest-0934"],
  args: {
    applied: true, result: "Asked SillyTavern to create the character card \"Arin\", but could not read it back, so it may exist.",
    readBack: { state: "unconfirmed", lossy: [], avatar: "Arin.png" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="card-readback"]')).toHaveAttribute("data-state", "unconfirmed");
    await expect(canvas.getByText(/may exist\. It is never created again/)).toBeVisible();
  },
};

export const ReadBackMismatch: Story = {
  tags: ["harvest-0934"],
  args: { applied: true, readBack: { state: "mismatch", lossy: ["name", "description"], avatar: "Arin.png" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="card-readback"]')).toHaveTextContent("stored some fields differently: name, description.");
  },
};

export const LoreKeyPreview: Story = {
  tags: ["harvest-0934"],
  args: {
    environment: { characterNames: [], lorebookNames: ["SO-Lore"], groupNames: [], storyLorebooks: ["SO-Lore"], ownedLorebooks: ["SO-Lore"],
      grantedLorebooks: [], castNames: [], personaNames: [] },
    op: { kind: "upsertLorebookEntry", lorebook: "SO-Lore", comment: "Customs", keys: ["customs", "ox"], content: "The customs house.", triggers: ["quiet"] },
    existing: null,
    context: { draft: HARBOUR, ops: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Key matches these draft texts: objective of The Quay.")).toBeVisible();
    await expect(canvas.getByText(/May not fire: only on quiet generations; gated: on only from The Vault\./)).toBeVisible();
    await expect(canvas.getByRole("list", { name: "Key lint" })).toHaveTextContent("under 3 characters");
    await expect(canvasElement.querySelector('[data-so="lore-preview"]')?.textContent ?? "").not.toMatch(/fires/i);
  },
};

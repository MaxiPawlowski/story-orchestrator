import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import ProvisioningCard from "./ProvisioningCard";

const meta: Meta<typeof ProvisioningCard> = {
  title: "Studio/ProvisioningCard",
  component: ProvisioningCard,
  args: {
    onApply: fn(),
    environment: { characterNames: ["Ponticius"], lorebookNames: ["Xentar Checkpoints"], groupNames: ["Xentar"], storyLorebooks: [], ownedLorebooks: [], grantedLorebooks: [] },
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
    environment: { characterNames: [], lorebookNames: ["Xentar Checkpoints"], groupNames: [], storyLorebooks: ["Xentar Checkpoints"], ownedLorebooks: ["Xentar Checkpoints"], grantedLorebooks: [] },
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
    environment: { characterNames: [], lorebookNames: ["Xentar Checkpoints"], groupNames: [], storyLorebooks: ["Xentar Checkpoints"], ownedLorebooks: ["Xentar Checkpoints"], grantedLorebooks: [] },
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

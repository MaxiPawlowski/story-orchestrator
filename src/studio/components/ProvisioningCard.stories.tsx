import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import ProvisioningCard from "./ProvisioningCard";

const meta: Meta<typeof ProvisioningCard> = {
  title: "Studio/ProvisioningCard",
  component: ProvisioningCard,
  args: {
    onApply: fn(),
    environment: { characterNames: ["Ponticius"], lorebookNames: ["Xentar Checkpoints"], groupNames: ["Xentar"], storyLorebooks: [] },
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
    await expect(await canvas.findByText(/is not this story's lorebook/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create it" })).toBeDisabled();
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

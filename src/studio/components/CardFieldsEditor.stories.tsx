import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { CardBinding } from "@engine/schema";
import CardFieldsEditor from "./CardFieldsEditor";

const meta: Meta<typeof CardFieldsEditor> = { title: "Studio/CardFieldsEditor", component: CardFieldsEditor,
  args: { qualities: [{ key: "outfit", type: "string", source: "extractor", rubric: "The character's visible outfit." }], roster: [], player: undefined },
  render: function CardFieldLayers(args) {
    const [card, setCard] = useState<CardBinding | undefined>({ fields: { outfit: { quality: "outfit", visual: true } } });
    return <CardFieldsEditor {...args} card={card} onChange={setCard} />;
  },
};
export default meta;
type Story = StoryObj<typeof CardFieldsEditor>;
export const Layers: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("checkbox", { name: "Field 1 rebase" }));
  await expect(canvas.getByRole("checkbox", { name: "Field 1 rebase" })).toBeChecked();
  await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Field 1 layer" }), "decal");
  await expect(canvas.queryByRole("checkbox", { name: "Field 1 rebase" })).not.toBeInTheDocument();
  await userEvent.type(canvas.getByRole("spinbutton", { name: "Field 1 region x" }), "0.1");
  await expect(canvas.getByRole("group", { name: /Mark region/ })).toBeVisible();
} };

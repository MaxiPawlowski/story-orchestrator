import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import SpriteEditRegion from "./SpriteEditRegion";
import type { FrameRegion } from "../../sprites/builder/frameRegion";

function Editable() {
  const [box, setBox] = useState({ x: 8, y: 0, width: 64, height: 64 });
  const [region, setRegion] = useState<FrameRegion>();
  return <SpriteEditRegion reference="" size={{ width: 80, height: 100 }} box={box} changeBox={setBox}
    region={region} changeRegion={setRegion} mouth busy={false} />;
}

const meta: Meta<typeof SpriteEditRegion> = { title: "Studio/SpriteEditRegion", component: SpriteEditRegion };
export default meta;
type Story = StoryObj<typeof SpriteEditRegion>;

export const MouthControls: Story = { render: () => <Editable />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText("Mouth replacement region"));
  const x = canvas.getByRole("spinbutton", { name: "Mouth x" });
  await userEvent.clear(x); await userEvent.type(x, "12");
  await expect(x).toHaveValue(12);
  await userEvent.click(canvas.getByRole("button", { name: "Reset mouth region" }));
  await expect(x).toHaveValue(20);
} };

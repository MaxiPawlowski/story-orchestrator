import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { SearchField } from "./SearchField";

const Demo = () => {
  const [query, setQuery] = useState("");
  return <SearchField label="Find a setting" value={query} onChange={setQuery} />;
};

const meta = { title: "Kit/SearchField", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TypeAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole("searchbox", { name: "Find a setting" });
    await expect(box).toHaveAttribute("placeholder", "Find a setting");
    await expect(canvas.queryByRole("button")).toBeNull();
    await userEvent.type(box, "memory");
    await userEvent.click(canvas.getByRole("button", { name: "Clear: Find a setting" }));
    await expect(box).toHaveValue("");
  },
};

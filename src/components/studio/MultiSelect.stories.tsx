import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import MultiSelect from "./MultiSelect";

const meta: Meta<typeof MultiSelect> = {
  title: "Studio/MultiSelect",
  component: MultiSelect,
};

export default meta;
type Story = StoryObj<typeof MultiSelect>;

const Stateful = (args: any) => {
  const [value, setValue] = useState<string[]>(args.value ?? []);
  return <MultiSelect {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: (args) => <Stateful {...args} />,
  args: {
    options: [
      { value: "a", label: "Ancient Gate" },
      { value: "b", label: "Ruins Cache" },
      { value: "c", label: "Companion Secret (not in lorebook)" },
    ],
    value: ["a"],
    placeholder: "Search entries...",
  },
};

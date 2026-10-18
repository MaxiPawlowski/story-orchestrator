import type { Meta, StoryObj } from "@storybook/react";
import MediaPending from "./MediaPending";

const meta = { title: "Feedback/Media pending", component: MediaPending } satisfies Meta<typeof MediaPending>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scene: Story = { args: { jobs: [{ kind: "image", chatId: "chat", startedAt: 0 }] } };
export const Character: Story = { args: { jobs: [{ kind: "sprite", chatId: "chat", startedAt: 0 }] } };

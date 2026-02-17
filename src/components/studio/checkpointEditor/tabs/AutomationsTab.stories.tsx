import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import AutomationsTab from "./AutomationsTab";

const Stateful = () => {
  const [automationDraft, setAutomationDraft] = useState("/checkpoint list\n/bg ruins day");
  const [commandSearch, setCommandSearch] = useState("");
  return (
    <AutomationsTab
      automationDraft={automationDraft}
      commandSearch={commandSearch}
      onCommandSearchChange={setCommandSearch}
      slashCommands={[
        { name: "checkpoint", aliases: ["cp"], description: "Checkpoint actions", samples: ["/checkpoint list"], isStoryOrchestrator: true },
        { name: "bg", aliases: [], description: "Set background", samples: ["/bg tavern"], isStoryOrchestrator: false },
      ]}
      slashCommandError={null}
      onReloadCommands={() => {}}
      onAutomationDraftChange={setAutomationDraft}
      onInsertAutomationLine={(command) => setAutomationDraft((prev) => prev ? `${prev}\n${command}` : command)}
    />
  );
};

const meta: Meta<typeof AutomationsTab> = {
  title: "Studio/Tabs/AutomationsTab",
  component: AutomationsTab,
  render: () => <Stateful />,
};

export default meta;
type Story = StoryObj<typeof AutomationsTab>;

export const Default: Story = {};

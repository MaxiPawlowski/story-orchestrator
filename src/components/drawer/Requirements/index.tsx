import { useContext } from "react";
import RequirementIndicator from "../../common/RequirementIndicator";
import StoryContext from "../../context/StoryContext";

const Requirements = () => {
  const ctx = useContext(StoryContext);
  if (!ctx) return null;

  const { personaDefined, groupChatSelected, worldLorePresent, onPersonaReload, missingRoles } = ctx;

  const flagToColor = (present: boolean | undefined) => present ? 'green' : 'yellow';
  const groupText = !groupChatSelected ? 'Group chat - Please select a chat group' : (missingRoles && missingRoles.length ? `Group chat - missing: ${missingRoles.join(', ')}` : 'Group chat');
  const groupColor = !groupChatSelected ? 'yellow' : (missingRoles && missingRoles.length ? 'red' : 'green');

  return (
    <div className="flex flex-col gap-2">
      <RequirementIndicator text="Persona defined" color={flagToColor(personaDefined)} onReload={onPersonaReload} />
      <RequirementIndicator text={groupText} color={groupColor} />
      <RequirementIndicator text="World lore" color={flagToColor(worldLorePresent)} />
    </div>
  );
};

export default Requirements;


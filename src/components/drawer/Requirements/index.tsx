import { useContext } from "react";
import RequirementIndicator from "../../common/RequirementIndicator";
import StoryContext from "../../context/StoryContext";

const Requirements = () => {
  const ctx = useContext(StoryContext);
  if (!ctx) return null;

  const { personaDefined, groupChatSelected, worldLorePresent, onPersonaReload, missingRoles } = ctx;
  const { worldLoreMissing, globalLorePresent, globalLoreMissing } = ctx as any;

  const flagToColor = (present: boolean | undefined) => present ? 'green' : 'yellow';
  const groupText = !groupChatSelected ? 'Group chat - Please select a chat group' : (missingRoles && missingRoles.length ? `Group chat - missing: ${missingRoles.join(', ')}` : 'Group chat');
  const groupColor = !groupChatSelected ? 'yellow' : (missingRoles && missingRoles.length ? 'red' : 'green');

  const personaDetail = personaDefined ? null : 'No persona name set in your profile. Click reload after setting it.';
  const groupDetail = !groupChatSelected ? 'Please select a group chat in the UI.' : (missingRoles && missingRoles.length ? `Missing roles: ${missingRoles.join(', ')}` : null);
  const worldDetail = worldLorePresent ? null : (Array.isArray(worldLoreMissing) && worldLoreMissing.length ? `Missing world entries: ${worldLoreMissing.join(', ')}` : 'No world-info entries found.');
  const globalDetail = globalLorePresent ? null : (Array.isArray(globalLoreMissing) && globalLoreMissing.length ? `Missing global lorebook: ${globalLoreMissing.join(', ')}` : 'Global lorebook not selected.');

  const lorePresent = Boolean(worldLorePresent && globalLorePresent);
  const loreDetails: string[] = [];
  if (!worldLorePresent) {
    if (worldDetail) loreDetails.push(worldDetail);
  }
  if (!globalLorePresent) {
    if (globalDetail) loreDetails.push(globalDetail);
  }
  const combinedLoreDetail = loreDetails.length ? loreDetails.join(' | ') : null;

  return (
    <div className="flex flex-col gap-2">
      <RequirementIndicator text="Persona defined" color={flagToColor(personaDefined)} onReload={onPersonaReload} detail={personaDetail} />
      <RequirementIndicator text={groupText} color={groupColor} detail={groupDetail} />
      <RequirementIndicator text="World lore" color={flagToColor(lorePresent)} detail={combinedLoreDetail} />
    </div>
  );
};

export default Requirements;

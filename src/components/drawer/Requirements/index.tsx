import { useContext } from "react";
import RequirementIndicator from "../../common/RequirementIndicator";
import StoryContext from "../../context/StoryContext";

const Requirements = () => {
  const ctx = useContext(StoryContext);
  if (!ctx) return null;

  const {
    personaDefined,
    groupChatSelected,
    missingGroupMembers,
    worldLoreEntriesPresent,
    globalLoreBookPresent,
    worldLoreEntriesMissing,
    globalLoreBookMissing,
    onPersonaReload,
  } = ctx;

  const flagToColor = (present: boolean | undefined) => present ? 'green' : 'yellow';

  const personaDetail = personaDefined ? null : 'No persona name set in your profile. Click reload after setting it.';

  const groupText = 'Group chat readiness';
  const hasMissingMembers = Array.isArray(missingGroupMembers) && missingGroupMembers.length > 0;
  const groupColor = !groupChatSelected
    ? 'yellow'
    : (hasMissingMembers ? 'red' : 'green');

  const groupDetails: string[] = [];
  if (!groupChatSelected) {
    groupDetails.push('Please select a group chat in the UI.');
  } else {
    if (hasMissingMembers) {
      if (missingGroupMembers?.length) {
        groupDetails.push(`Missing in group: ${missingGroupMembers.join(', ')}`);
      } else {
        groupDetails.push('No matching group members detected.');
      }
    }
    if (groupDetails.length === 0) {
      groupDetails.push('Group chat contains all required members.');
    }
  }
  const groupDetail = groupDetails.length ? groupDetails.join(' | ') : null;

  const worldDetail = worldLoreEntriesPresent ? null : (Array.isArray(worldLoreEntriesMissing) && worldLoreEntriesMissing.length ? `Missing world entries: ${worldLoreEntriesMissing.join(', ')}` : 'No world-info entries found.');
  const globalDetail = globalLoreBookPresent ? null : (Array.isArray(globalLoreBookMissing) && globalLoreBookMissing.length ? `Missing global lorebook: ${globalLoreBookMissing.join(', ')}` : 'Global lorebook not selected.');

  const lorePresent = Boolean(worldLoreEntriesPresent && globalLoreBookPresent);
  const loreDetails: string[] = [];
  if (!worldLoreEntriesPresent) {
    if (worldDetail) loreDetails.push(worldDetail);
  }
  if (!globalLoreBookPresent) {
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

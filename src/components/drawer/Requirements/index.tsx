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

  const flagToStatus = (present: boolean | undefined): "success" | "warning" => (present ? "success" : "warning");

  const personaDetail = personaDefined ? null : 'No persona name set in your profile. Click reload after setting it.';

  const groupText = 'Group chat readiness';
  const hasMissingMembers = missingGroupMembers.length > 0;
  const groupStatus: "success" | "warning" | "error" = !groupChatSelected
    ? "warning"
    : (hasMissingMembers ? "error" : "success");

  const groupDetails: string[] = [];
  if (!groupChatSelected) {
    groupDetails.push('Please select a group chat in the UI.');
  } else {
    if (hasMissingMembers) {
      groupDetails.push(`Missing in group: ${missingGroupMembers.join(', ')}`);
    }
    if (groupDetails.length === 0) {
      groupDetails.push('Group chat contains all required members.');
    }
  }
  const groupDetail = groupDetails.length ? groupDetails.join(' | ') : null;

  const worldDetail = worldLoreEntriesPresent ? null : (worldLoreEntriesMissing.length ? `Missing world entries: ${worldLoreEntriesMissing.join(', ')}` : 'No world-info entries found.');
  const globalDetail = globalLoreBookPresent ? null : (globalLoreBookMissing.length ? `Missing global lorebook: ${globalLoreBookMissing.join(', ')}` : 'Global lorebook not selected.');

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
      <RequirementIndicator text="Persona defined" status={flagToStatus(personaDefined)} onReload={onPersonaReload} detail={personaDetail} />
      <RequirementIndicator text={groupText} status={groupStatus} detail={groupDetail} />
      <RequirementIndicator text="World lore" status={flagToStatus(lorePresent)} detail={combinedLoreDetail} />
    </div>
  );
};

export default Requirements;

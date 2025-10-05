export interface StoryRequirementsState {
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  missingGroupMembers: string[];
  worldLoreEntriesPresent: boolean;
  worldLoreEntriesMissing: string[];
  globalLoreBookPresent: boolean;
  globalLoreBookMissing: string[];
}

export const DEFAULT_REQUIREMENTS_STATE: StoryRequirementsState = {
  requirementsReady: false,
  currentUserName: "",
  personaDefined: true,
  groupChatSelected: false,
  missingGroupMembers: [],
  worldLoreEntriesPresent: true,
  worldLoreEntriesMissing: [],
  globalLoreBookPresent: true,
  globalLoreBookMissing: [],
};

export const cloneRequirementsState = (state: StoryRequirementsState): StoryRequirementsState => ({
  ...state,
  missingGroupMembers: state.missingGroupMembers.slice(),
  worldLoreEntriesMissing: state.worldLoreEntriesMissing.slice(),
  globalLoreBookMissing: state.globalLoreBookMissing.slice(),
});

export const createRequirementsState = (base?: StoryRequirementsState): StoryRequirementsState => (
  cloneRequirementsState(base ?? DEFAULT_REQUIREMENTS_STATE)
);

export type RequirementsStatePatch = Partial<StoryRequirementsState> & {
  missingGroupMembers?: string[];
  worldLoreEntriesMissing?: string[];
  globalLoreBookMissing?: string[];
};

export const mergeRequirementsState = (
  prev: StoryRequirementsState,
  patch: RequirementsStatePatch,
): StoryRequirementsState => ({
  ...prev,
  ...patch,
  missingGroupMembers: patch.missingGroupMembers ? patch.missingGroupMembers.slice() : prev.missingGroupMembers.slice(),
  worldLoreEntriesMissing: patch.worldLoreEntriesMissing ? patch.worldLoreEntriesMissing.slice() : prev.worldLoreEntriesMissing.slice(),
  globalLoreBookMissing: patch.globalLoreBookMissing ? patch.globalLoreBookMissing.slice() : prev.globalLoreBookMissing.slice(),
});

export const areRequirementStatesEqual = (
  a: StoryRequirementsState,
  b: StoryRequirementsState,
): boolean => {
  if (a === b) return true;
  return (
    a.requirementsReady === b.requirementsReady
    && a.currentUserName === b.currentUserName
    && a.personaDefined === b.personaDefined
    && a.groupChatSelected === b.groupChatSelected
    && arrayShallowEqual(a.missingGroupMembers, b.missingGroupMembers)
    && a.worldLoreEntriesPresent === b.worldLoreEntriesPresent
    && arrayShallowEqual(a.worldLoreEntriesMissing, b.worldLoreEntriesMissing)
    && a.globalLoreBookPresent === b.globalLoreBookPresent
    && arrayShallowEqual(a.globalLoreBookMissing, b.globalLoreBookMissing)
  );
};

const arrayShallowEqual = (a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

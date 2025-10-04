export interface StoryRequirementsState {
  requirementsReady: boolean;
  currentUserName: string;
  personaDefined: boolean;
  groupChatSelected: boolean;
  worldLorePresent: boolean;
  worldLoreMissing: string[];
  globalLorePresent: boolean;
  globalLoreMissing: string[];
  requiredRolesPresent: boolean;
  missingRoles: string[];
}

export const DEFAULT_REQUIREMENTS_STATE: StoryRequirementsState = {
  requirementsReady: false,
  currentUserName: "",
  personaDefined: true,
  groupChatSelected: false,
  worldLorePresent: true,
  worldLoreMissing: [],
  globalLorePresent: true,
  globalLoreMissing: [],
  requiredRolesPresent: false,
  missingRoles: [],
};

export const cloneRequirementsState = (state: StoryRequirementsState): StoryRequirementsState => ({
  ...state,
  worldLoreMissing: state.worldLoreMissing.slice(),
  globalLoreMissing: state.globalLoreMissing.slice(),
  missingRoles: state.missingRoles.slice(),
});

export const createRequirementsState = (base?: StoryRequirementsState): StoryRequirementsState => (
  cloneRequirementsState(base ?? DEFAULT_REQUIREMENTS_STATE)
);

export type RequirementsStatePatch = Partial<StoryRequirementsState> & {
  worldLoreMissing?: string[];
  globalLoreMissing?: string[];
  missingRoles?: string[];
};

export const mergeRequirementsState = (
  prev: StoryRequirementsState,
  patch: RequirementsStatePatch,
): StoryRequirementsState => ({
  ...prev,
  ...patch,
  worldLoreMissing: patch.worldLoreMissing ? patch.worldLoreMissing.slice() : prev.worldLoreMissing.slice(),
  globalLoreMissing: patch.globalLoreMissing ? patch.globalLoreMissing.slice() : prev.globalLoreMissing.slice(),
  missingRoles: patch.missingRoles ? patch.missingRoles.slice() : prev.missingRoles.slice(),
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
    && a.worldLorePresent === b.worldLorePresent
    && arrayShallowEqual(a.worldLoreMissing, b.worldLoreMissing)
    && a.globalLorePresent === b.globalLorePresent
    && arrayShallowEqual(a.globalLoreMissing, b.globalLoreMissing)
    && a.requiredRolesPresent === b.requiredRolesPresent
    && arrayShallowEqual(a.missingRoles, b.missingRoles)
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

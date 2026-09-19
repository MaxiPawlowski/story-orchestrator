export const WIZARD_QUESTION_LIMIT = 3;

export interface WizardQuestion {
  id: string;
  text: string;
  why?: string;
  options?: string[];
}

export interface WizardAnswer {
  id: string;
  text: string;
}

// Provisioning acts on the SillyTavern install, not on the draft: these ops are never applied by
// `applyOps` and never ride a bulk accept. They still travel as ProposalOps so the parser, the
// proposal card and the audit path stay single-sourced.
export type ProvisioningOp =
  | { kind: "createCharacterCard"; name: string; description: string; role?: string; personality?: string; scenario?: string; first_mes?: string; mes_example?: string; tags?: string[] }
  | { kind: "createStoryLorebook"; name: string }
  | { kind: "upsertLorebookEntry"; lorebook: string; comment: string; keys: string[]; content: string; constant?: boolean }
  | { kind: "createGroup"; name: string; members: string[] };

export type ProvisioningOpKind = ProvisioningOp["kind"];

export const PROVISIONING_OP_KINDS: readonly ProvisioningOpKind[] = ["createCharacterCard", "createStoryLorebook", "upsertLorebookEntry", "createGroup"];

// What already exists on this install. Everything the create-only rule needs, and nothing else.
export interface ProvisioningEnvironment {
  characterNames: string[];
  lorebookNames: string[];
  groupNames: string[];
  storyLorebooks: string[];
}

export interface ProvisioningResult {
  ok: boolean;
  message: string;
  created?: string;
}

export interface WizardSessionState {
  key: string;
  stage: string;
  history: Array<{ role: "author" | "copilot"; text: string }>;
  questions: WizardQuestion[];
  applied: string[];
  seed: string;
  updatedAt: string;
}

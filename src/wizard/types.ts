import type { AgentSession } from "../copilot/agent/types";

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
  | { kind: "createGroup"; name: string; members: string[] }
  | { kind: "grantLorebook"; lorebook: string; revoke?: boolean };

export type ProvisioningOpKind = ProvisioningOp["kind"];

export const PROVISIONING_OP_KINDS: readonly ProvisioningOpKind[] = ["createCharacterCard", "createStoryLorebook", "upsertLorebookEntry", "createGroup", "grantLorebook"];

// What already exists on this install. Everything the create-only rule needs, and nothing else.
// `storyLorebooks` is what the story *requires*, which is a claim about what the
// story depends on and not a licence to write. `ownedLorebooks` is the write authority — books this
// wizard created for this story, plus the ones the author explicitly granted.
export interface ProvisioningEnvironment {
  characterNames: string[];
  lorebookNames: string[];
  groupNames: string[];
  storyLorebooks: string[];
  ownedLorebooks: string[];
  // The subset of `ownedLorebooks` the author allowed rather than the wizard created. A created
  // book has no business being revocable from here; a granted one is the author's to take back.
  grantedLorebooks: string[];
  castNames: string[];
  personaNames: string[];
}

export interface ProvisioningResult {
  ok: boolean;
  message: string;
  created?: string;
}

// What an entry holds right now, so a write can show a before/after instead of asking the author to
// trust the replacement. `null` means there is nothing under that title yet.
export interface ExistingEntry {
  content: string;
  keys: string[];
  constant: boolean;
}

export const entryKey = (lorebook: string, comment: string): string => `${lorebook}\u0000${comment}`;

export interface WizardLorebookGrant {
  storyId: string;
  lorebookFileId: string;
  at: string;
  confirmed: true;
}

/** What the UI saves: its snapshot does not carry the created-book list, which only the coordinator
 *  writes, so a save without one keeps the stored list. */
export type WizardSessionUpdate = Omit<WizardSessionState, "createdLorebooks"> & Partial<Pick<WizardSessionState, "createdLorebooks">>;

export interface WizardSessionState {
  key: string;
  stage: string;
  history: Array<{ role: "author" | "copilot"; text: string }>;
  questions: WizardQuestion[];
  applied: string[];
  /** The subset of `applied` that is a LOREBOOK this wizard created. `applied` holds names only,
   *  so a card and a book of the same name read the same there. */
  createdLorebooks: string[];
  /** Author-confirmed write authority over existing lorebooks; never authored story content. */
  grants?: WizardLorebookGrant[];
  agent?: AgentSession;
  seed: string;
  updatedAt: string;
}

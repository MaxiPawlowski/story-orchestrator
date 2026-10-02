import { PROVISIONING_OP_KINDS, type ProvisioningEnvironment, type ProvisioningOp, type ProvisioningOpKind } from "./types";
import { lorebookFileId } from "@utils/string";
import { nearestKey } from "@utils/levenshtein";
import { castCardName, castMemberNames, type StoryV2 } from "@engine/index";

const norm = (value: string) => value.trim().toLowerCase();
const has = (values: string[], wanted: string) => values.some((value) => norm(value) === norm(wanted));
// Lorebook comparisons key on the file id the host actually addresses, not the display title:
// `world_names` lists file ids and a title with `:` or `?` is filed under its sanitised form.
const hasFile = (values: string[], wanted: string) => values.some((value) => norm(lorebookFileId(value)) === norm(lorebookFileId(wanted)));

export const unknownPersonas = (personas: readonly string[] | undefined, environment: Pick<ProvisioningEnvironment, "personaNames">): string[] =>
  (personas ?? []).filter((name) => name.trim() && !has(environment.personaNames, name));

export const personaRequirementProblem = (personas: readonly string[] | undefined, environment: Pick<ProvisioningEnvironment, "personaNames">): string | null => {
  const unknown = unknownPersonas(personas, environment);
  if (!unknown.length) return null;
  const listed = environment.personaNames.length ? `Personas on this install: ${environment.personaNames.join(", ")}.` : "This install lists no persona.";
  return `requirements.personas names ${unknown.map((name) => `"${name}"`).join(", ")}, which ${unknown.length === 1 ? "is not a persona" : "are not personas"} on this install. ` +
    "Personas are the author's own and are never created by the wizard, so a story that requires a missing one never starts: leave personas out, or name an existing one. " +
    listed;
};

export const draftCastNames = (story: Pick<StoryV2, "roster" | "requirements"> | null | undefined): string[] =>
  (story ? castMemberNames(story.roster ?? [], [...(story.roster ?? []).map(castCardName), ...(story.requirements?.members ?? [])]) : []);

export const isProvisioningKind = (kind: string): kind is ProvisioningOpKind => (PROVISIONING_OP_KINDS as readonly string[]).includes(kind);

export const emptyEnvironment = (): ProvisioningEnvironment => ({
  characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [], ownedLorebooks: [], grantedLorebooks: [], castNames: [], personaNames: [],
});

export interface ProvisioningValidation {
  ok: boolean;
  message: string;
}

const OK: ProvisioningValidation = { ok: true, message: "" };
const fail = (message: string): ProvisioningValidation => ({ ok: false, message });

const outsideCast = (members: string[], cast: string[]): string => {
  if (!cast.length) return `This story has no cast yet, so its group cannot hold ${members.map((member) => `"${member}"`).join(", ")}. Add the cast to the roster first.`;
  const named = members.map((member) => {
    const near = nearestKey(member, cast);
    return near ? `"${member}" (did you mean "${near}"?)` : `"${member}"`;
  });
  return `Not in this story's cast: ${named.join(", ")}. A story's group holds only its own cast (${cast.join(", ")}), never another story's card: ` +
    "add them to the roster first, or leave them out.";
};

// The create-only invariant is enforced here, not in the prompt (spec addendum §Story wizard): an op
// naming something that already exists is rejected with a message the author can act on. The single
// exception is an entry written into a lorebook this story owns.
export function validateProvisioningOp(op: ProvisioningOp, environment: ProvisioningEnvironment): ProvisioningValidation {
  switch (op.kind) {
    case "createCharacterCard": {
      if (!op.name.trim()) return fail("A character card needs a name.");
      if (!op.description.trim()) return fail(`"${op.name}" needs a description — an empty card is not playable.`);
      if (has(
        environment.characterNames,
        op.name,
      )) return fail(`A character called "${op.name}" already exists. The wizard only creates cards, it never edits yours — rename this one or drop the step.`);
      return OK;
    }
    case "createStoryLorebook": {
      if (!op.name.trim()) return fail("A lorebook needs a name.");
      if (hasFile(environment.lorebookNames, op.name)) return fail(`The lorebook "${op.name}" already exists. Pick a new name, or write entries into it only if it is this story's own book.`);
      return OK;
    }
    case "upsertLorebookEntry": {
      if (!op.lorebook.trim()) return fail("A lorebook entry needs a lorebook.");
      if (!op.comment.trim()) return fail("A lorebook entry needs a title.");
      if (!op.content.trim()) return fail(`"${op.comment}" has no content.`);
      if (!hasFile(environment.lorebookNames, op.lorebook)) return fail(`"${op.lorebook}" does not exist yet. Add a step that creates it before writing entries into it.`);
      // The story *requiring* a book says it depends on the book. Only a book this wizard made
      // for this story — or one the author explicitly granted — may be written into.
      if (!hasFile(
        environment.ownedLorebooks,
        op.lorebook,
      )) return fail(`The wizard has not created "${op.lorebook}" for this story, so it will not write into it. Create the story's own lorebook first, or grant this story ` +
        `permission to use the existing one.`);
      return OK;
    }
    case "grantLorebook": {
      if (!op.lorebook.trim()) return fail("A grant needs a lorebook.");
      if (!hasFile(environment.lorebookNames, op.lorebook)) return fail(`"${op.lorebook}" does not exist, so there is nothing to grant.`);
      return OK;
    }
    case "createGroup": {
      if (!op.name.trim()) return fail("A group needs a name.");
      if (has(environment.groupNames, op.name)) return fail(`A group called "${op.name}" already exists — select it instead of creating a second one.`);
      if (!op.members.length) return fail(`"${op.name}" has no members.`);
      const foreign = op.members.filter((member) => !has(environment.castNames, member));
      if (foreign.length) return fail(outsideCast(foreign, environment.castNames));
      const missing = op.members.filter((member) => !has(environment.characterNames, member));
      if (missing.length) return fail(`These cast members do not exist yet: ${missing.join(", ")}. Create their cards first.`);
      return OK;
    }
    default:
      return fail("Unknown provisioning step.");
  }
}

// A provisioning op changes what the *next* op may legally do, so previews fold the environment
// forward instead of validating every op against the install as it is right now.
export function advanceEnvironment(environment: ProvisioningEnvironment, op: ProvisioningOp): ProvisioningEnvironment {
  switch (op.kind) {
    case "createCharacterCard":
      return { ...environment, characterNames: [...environment.characterNames, op.name], castNames: [...environment.castNames, op.name] };
    case "createStoryLorebook":
      return {
        ...environment,
        lorebookNames: [...environment.lorebookNames, lorebookFileId(op.name)],
        storyLorebooks: [...environment.storyLorebooks, op.name],
        ownedLorebooks: [...environment.ownedLorebooks, lorebookFileId(op.name)],
      };
    case "grantLorebook": {
      const fileId = lorebookFileId(op.lorebook);
      const drop = (values: string[]) => values.filter((value) => !hasFile([value], fileId));
      if (op.revoke) {
        return hasFile(environment.grantedLorebooks, fileId)
          ? { ...environment, ownedLorebooks: drop(environment.ownedLorebooks), grantedLorebooks: drop(environment.grantedLorebooks) }
          : environment;
      }
      // Granting a book the wizard created says nothing new, so it must not become revocable here.
      if (hasFile(environment.ownedLorebooks, fileId)) return environment;
      return { ...environment, ownedLorebooks: [...environment.ownedLorebooks, fileId], grantedLorebooks: [...environment.grantedLorebooks, fileId] };
    }
    case "createGroup":
      return { ...environment, groupNames: [...environment.groupNames, op.name] };
    default:
      return environment;
  }
}

export interface ProvisioningPlanItem {
  index: number;
  op: ProvisioningOp;
  validation: ProvisioningValidation;
}

// A book the story *requires*, that exists and is not yet this story's to write into, is a
// decision only the author can make — so it becomes a card they can accept or ignore rather than
// something the model proposes. Empty when the story owns everything it requires (the usual case,
// since provisioning a missing book makes it owned).
export function grantCandidates(environment: ProvisioningEnvironment): string[] {
  return environment.storyLorebooks.filter((book) => hasFile(environment.lorebookNames, book) && !hasFile(environment.ownedLorebooks, book));
}

// The way back. A permission the author granted is theirs to withdraw, and without a card the only
// route would be editing the session by hand — so a granted book stays on screen, offered in the
// other direction. A book this wizard *created* is not revocable (there is nothing to revoke: it is
// the story's own book), which is why the environment names the granted subset separately.
export function revokeCandidates(environment: ProvisioningEnvironment): string[] {
  return environment.grantedLorebooks.filter((book) => hasFile(environment.lorebookNames, book));
}

export function planProvisioning(ops: ProvisioningOp[], environment: ProvisioningEnvironment): { items: ProvisioningPlanItem[]; environment: ProvisioningEnvironment } {
  let current = environment;
  const items = ops.map((op, index) => {
    const validation = validateProvisioningOp(op, current);
    if (validation.ok) current = advanceEnvironment(current, op);
    return { index, op, validation };
  });
  return { items, environment: current };
}

// What a created asset means for the story record: the requirements panel goes green because the
// story now *requires* what the wizard just made, not because provisioning wrote to the engine.
export function provisioningRequirements(op: ProvisioningOp): { members: string[]; lorebooks: string[] } {
  if (op.kind === "createCharacterCard") return { members: [op.name], lorebooks: [] };
  if (op.kind === "createStoryLorebook") return { members: [], lorebooks: [op.name] };
  return { members: [], lorebooks: [] };
}

export function describeProvisioningOp(op: ProvisioningOp): { label: string; target: string } {
  switch (op.kind) {
    case "createCharacterCard":
      return { label: `Create character card "${op.name}"`, target: op.name };
    case "createStoryLorebook":
      return { label: `Create the story lorebook "${op.name}"`, target: op.name };
    case "upsertLorebookEntry":
      return { label: `Write "${op.comment}" into "${op.lorebook}"`, target: `${op.lorebook}/${op.comment}` };
    case "createGroup":
      return { label: `Create the group "${op.name}" with ${op.members.join(", ") || "no members"}`, target: op.name };
    case "grantLorebook":
      return { label: `${op.revoke ? "Revoke" : "Allow"} this story${op.revoke ? "'s permission" : ""} to write into the existing lorebook "${op.lorebook}"`, target: op.lorebook };
    default:
      return { label: "Unknown provisioning step", target: "" };
  }
}

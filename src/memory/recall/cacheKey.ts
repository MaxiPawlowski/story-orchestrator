import { fnv1a } from "@runtime/hash";
import type { SourceRevision } from "../audience";
import type { HeldSecret } from "../heldSecrets";

export interface RecallCacheInput {
  chatId: string;
  storyHash: string;
  member: string;
  query: string;
  witnessRevision: string;
  heldSecretsKey: string;
  candidates: ReadonlyArray<{ messageId: number; revision: SourceRevision }>;
}

export const recallCacheKey = (input: RecallCacheInput): string => JSON.stringify([
  input.chatId, input.storyHash, input.member, fnv1a(input.query), input.witnessRevision, fnv1a(input.heldSecretsKey),
  input.candidates.map((candidate) => [candidate.messageId, candidate.revision.swipeId, candidate.revision.hash]),
]);

const sorted = (values: Iterable<string>): string[] => [...values].sort();

export const heldSecretsKeyOf = (secrets: readonly HeldSecret[]): string =>
  JSON.stringify(secrets.map((secret) => [sorted(secret.knowers), secret.onlyFrom ? sorted(secret.onlyFrom) : null, secret.phrasings.map(sorted)]));

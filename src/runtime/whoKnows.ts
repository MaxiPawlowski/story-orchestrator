import { secretAudience, type EpistemicEntry, type HeldSecret, type SecretAudience } from "@memory/index";

export interface SecretGridMember {
  id: string;
  name: string;
  onStage: boolean;
}

export interface SecretGridRow {
  id: string;
  holder: string;
  tag: string;
  text: string;
  cells: Record<string, SecretAudience>;
}

export interface SecretGridAlert {
  secretId: string;
  memberId: string;
  name: string;
  text: string;
}

export interface SecretGridView {
  members: SecretGridMember[];
  rows: SecretGridRow[];
  alerts: SecretGridAlert[];
}

export interface GridMemberInput extends SecretGridMember {
  names: readonly string[];
}

export interface SecretGridInputs {
  secrets: readonly HeldSecret[];
  knowledge: readonly EpistemicEntry[];
  members: readonly GridMemberInput[];
}

export function buildSecretGrid(secrets: readonly HeldSecret[], knowledge: readonly EpistemicEntry[], members: readonly GridMemberInput[]): SecretGridView {
  const byId = new Map(knowledge.map((entry) => [entry.id, entry]));
  const rows = secrets.flatMap((secret): SecretGridRow[] => {
    const entry = secret.entryId ? byId.get(secret.entryId) : undefined;
    if (!entry) return [];
    const cells = Object.fromEntries(members.map((member) => [member.id, secretAudience(secret, entry, member.names)]));
    return [{ id: entry.id, holder: entry.subject, tag: entry.tag, text: entry.content, cells }];
  });
  const alerts = rows.flatMap((row) => members.filter((member) => member.onStage && row.cells[member.id] === "kept-out")
    .map((member) => ({ secretId: row.id, memberId: member.id, name: member.name, text: row.text })));
  return { members: members.map(({ id, name, onStage }) => ({ id, name, onStage })), rows, alerts };
}

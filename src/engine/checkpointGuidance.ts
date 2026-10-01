import { isRecord } from "@utils/guards";
import type { Checkpoint, RosterMember, ValidationError } from "./schema";

export const guidanceShared = (value: Checkpoint["guidance"]): string => (typeof value === "string" ? value : value?.all ?? "");

export const guidanceMembers = (value: Checkpoint["guidance"]): Record<string, string> => (typeof value === "string" || !value ? {} : value.members ?? {});

export const guidanceForMember = (value: Checkpoint["guidance"], rosterId: string | null): string => (rosterId ? guidanceMembers(value)[rosterId]?.trim() ?? "" : "");

export function readGuidance(value: unknown, path: string, errors: ValidationError[]): Checkpoint["guidance"] {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (!isRecord(value)) {
    errors.push({ path, message: "guidance must be text or { all, members }" });
    return undefined;
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== "all" && key !== "members");
  if (unknownKeys.length) errors.push({ path, message: `guidance takes only all and members, not ${unknownKeys.join(", ")}` });
  if (value.all !== undefined && typeof value.all !== "string") errors.push({ path: `${path}.all`, message: "guidance.all must be text" });
  if (value.members !== undefined && !isRecord(value.members)) errors.push({ path: `${path}.members`, message: "guidance.members must map a roster id to text" });
  const members: Record<string, string> = {};
  for (const [id, text] of Object.entries(isRecord(value.members) ? value.members : {})) {
    if (!id.trim()) errors.push({ path: `${path}.members`, message: "a member guidance needs a roster id" });
    else if (typeof text !== "string") errors.push({ path: `${path}.members.${id}`, message: "member guidance must be text" });
    else if (text.trim()) members[id.trim()] = text.trim();
  }
  return buildGuidance(typeof value.all === "string" ? value.all : "", members);
}

export function buildGuidance(all: string, members: Record<string, string>): Checkpoint["guidance"] {
  const kept = Object.fromEntries(Object.entries(members).filter(([id, text]) => id.trim() && text.trim()));
  if (!Object.keys(kept).length) return all || undefined;
  return all.trim() ? { all, members: kept } : { members: kept };
}

const rosterIndex = (roster: RosterMember[]) => {
  const byRef = new Map<string, string>();
  roster.forEach((member) => {
    if (typeof member?.id !== "string") return;
    byRef.set(member.id.trim().toLowerCase(), member.id);
    if (member.name) byRef.set(member.name.trim().toLowerCase(), member.id);
  });
  return byRef;
};

export function resolveGuidanceMembers(checkpoints: Checkpoint[], roster: RosterMember[]): void {
  const byRef = rosterIndex(roster);
  for (const checkpoint of checkpoints) {
    const members = guidanceMembers(checkpoint.guidance);
    if (!Object.keys(members).length) continue;
    const resolved: Record<string, string> = {};
    for (const [ref, text] of Object.entries(members)) {
      const id = byRef.get(ref.trim().toLowerCase()) ?? ref;
      resolved[id] = resolved[id] ? `${resolved[id]}\n${text}` : text;
    }
    checkpoint.guidance = buildGuidance(guidanceShared(checkpoint.guidance), resolved);
  }
}

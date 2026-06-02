import { isNonArrayObject } from "@utils/dataHelpers";

export const resolveGroupMemberName = (member: unknown): string => {
  if (typeof member === 'string' || typeof member === 'number') return String(member);
  if (isNonArrayObject(member)) {
    const candidate = member.name ?? member.display_name ?? member.id;
    return candidate ? String(candidate) : "";
  }
  return "";
};

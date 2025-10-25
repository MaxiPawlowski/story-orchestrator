export const resolveGroupMemberName = (member: unknown): string => {
  if (typeof member === 'string' || typeof member === 'number') return String(member);
  if (member && typeof member === 'object') {
    const source = member as Record<string, unknown>;
    const candidate = source.name ?? source.display_name ?? source.id;
    return candidate ? String(candidate) : "";
  }
  return "";
};

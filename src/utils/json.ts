export const normalizeJsonText = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const embedded = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return embedded ? embedded[1].trim() : trimmed;
};

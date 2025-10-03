export function clampText(input: string, limit: number): string {
  const normalized = (input || '').replace(/\s+/g, ' ').trim();
  if (!Number.isFinite(limit)) return '';
  const safeLimit = Math.floor(limit);
  if (safeLimit <= 0) return normalized ? '...' : '';
  if (normalized.length <= safeLimit) return normalized;
  const truncation = Math.max(0, safeLimit - 3);
  return `${normalized.slice(0, truncation)}...`;
}

import { RESERVED_PORTS } from './laneRange.mts';

export const OWNER_ST_FLAG = '--owner-st';
export const OWNER_ST_PORT = 8000;
export const SHARED_CDP_PORT = 9222;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function urlPort(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (!LOOPBACK.has(url.hostname)) return null;
    if (url.port) return Number(url.port);
    return url.protocol === 'https:' ? 443 : url.protocol === 'http:' ? 80 : null;
  } catch {
    return null;
  }
}

export function ownerStRefusal({ tool, stUrls = [], cdpEndpoints = [], args = [] }: { tool: string; stUrls?: unknown[]; cdpEndpoints?: unknown[]; args?: string[] }): string | null {
  if (args.includes(OWNER_ST_FLAG)) return null;
  const hits: string[] = [];
  for (const url of stUrls) if (urlPort(url) === OWNER_ST_PORT) hits.push(`ST ${String(url)} (${RESERVED_PORTS[OWNER_ST_PORT]})`);
  for (const url of cdpEndpoints) if (urlPort(url) === SHARED_CDP_PORT) hits.push(`CDP ${String(url)} (${RESERVED_PORTS[SHARED_CDP_PORT]})`);
  if (!hits.length) return null;
  return `${tool} refused: it would read ${[...new Set(hits)].join(' and ')}. Run it on a lane (node scripts/debug/st-lanes.mts run <n> -- scripts/debug/${tool} ...), or pass ${OWNER_ST_FLAG} when the owner asked for a header of their own install.`;
}

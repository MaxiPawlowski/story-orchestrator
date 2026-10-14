import { evaluateInST } from './evaluate.mts';

export interface TouchPressSpec {
  selector?: string;
  graphNode?: string;
  holdMs?: number;
}

export interface TouchPoint {
  x: number;
  y: number;
  target: string;
}

export const DEFAULT_TOUCH_HOLD_MS = 700;
export const GRAPH_CANVAS = '#so-studio-modal [data-so="graph-canvas"]';

export function touchPressSpec(value: unknown): Required<Pick<TouchPressSpec, 'holdMs'>> & TouchPressSpec {
  const spec = value && typeof value === 'object' ? value as TouchPressSpec : {};
  const selector = typeof spec.selector === 'string' && spec.selector.trim() ? spec.selector : undefined;
  const graphNode = typeof spec.graphNode === 'string' && spec.graphNode.trim() ? spec.graphNode : undefined;
  if (!selector && !graphNode) throw new Error('touch-press needs a selector or a graphNode');
  const holdMs = spec.holdMs === undefined ? DEFAULT_TOUCH_HOLD_MS : Number(spec.holdMs);
  if (!Number.isFinite(holdMs) || holdMs < 0 || holdMs > 10000) throw new Error(`touch-press holdMs must be 0..10000, got ${String(spec.holdMs)}`);
  return { ...(selector ? { selector } : {}), ...(graphNode ? { graphNode } : {}), holdMs };
}

export async function touchPoint(page, spec: TouchPressSpec): Promise<TouchPoint> {
  return evaluateInST(page, ({ selector, graphNode, canvas }: { selector?: string; graphNode?: string; canvas: string }) => {
    if (graphNode) {
      const container = document.querySelector(selector ?? canvas) as (HTMLElement & { _cyreg?: { cy?: any } }) | null;
      const cy = container?._cyreg?.cy;
      if (!container || !cy) throw new Error(`no graph at ${selector ?? canvas}`);
      container.scrollIntoView({ block: 'center' });
      cy.resize();
      const node = cy.getElementById(graphNode);
      if (!node || node.empty()) throw new Error(`graph node ${graphNode} is not on the canvas`);
      const box = container.getBoundingClientRect();
      const position = node.renderedPosition();
      const x = box.left + position.x;
      const y = box.top + position.y;
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) throw new Error(`graph node ${graphNode} is outside the visible canvas`);
      return { x, y, target: `node ${graphNode}` };
    }
    const element = document.querySelector(selector as string) as HTMLElement | null;
    if (!element) throw new Error(`nothing matches ${selector}`);
    element.scrollIntoView({ block: 'center' });
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) throw new Error(`${selector} has no box`);
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, target: selector as string };
  }, { ...spec, canvas: GRAPH_CANVAS });
}

export async function touchPress(page, value: unknown, wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const spec = touchPressSpec(value);
  const point = await touchPoint(page, spec);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    await wait(spec.holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
  return { ...point, holdMs: spec.holdMs, input: 'cdp-touch' };
}

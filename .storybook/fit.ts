import { expect } from "@storybook/test";

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  wide: { width: 1440, height: 900 },
} as const;

type Viewport = (typeof VIEWPORTS)[keyof typeof VIEWPORTS];
type Primary = (canvasElement: HTMLElement) => Promise<Element | null> | Element | null;

export async function expectFits(canvasElement: HTMLElement, primary: Element | null): Promise<void> {
  const page = canvasElement.ownerDocument.documentElement;
  await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  await expect(primary).not.toBeNull();
  await expect(primary).toBeVisible();
  const box = (primary as Element).getBoundingClientRect();
  await expect(box.width).toBeGreaterThan(0);
  await expect(box.left).toBeGreaterThanOrEqual(0);
  await expect(box.right).toBeLessThanOrEqual(page.clientWidth);
}

export const fitsAt = (viewport: Viewport, primary: Primary, parameters: Record<string, unknown> = {}) => ({
  parameters: { ...parameters, testViewport: viewport },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await expectFits(canvasElement, await primary(canvasElement));
  },
});

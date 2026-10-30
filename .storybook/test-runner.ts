import type { TestRunnerConfig } from "@storybook/test-runner";
import { getStoryContext } from "@storybook/test-runner";
import { injectAxe, checkA11y, configureAxe } from "axe-playwright";

type Page = Parameters<NonNullable<TestRunnerConfig["postVisit"]>>[0];

const NO_TRANSITIONS = "*, *::before, *::after { transition: none !important; }";

const settle = (page: Page) => page.evaluate(async () => {
  const finite = document.getAnimations().filter((animation) => animation.playState === "running"
    && Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity));
  await Promise.race([Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))), new Promise((done) => setTimeout(done, 2000))]);
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
});

const config: TestRunnerConfig = {
  async preVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const viewport = storyContext.parameters?.testViewport as { width: number; height: number } | undefined;
    await page.setViewportSize(viewport ?? { width: 1280, height: 720 });
    await page.addStyleTag({ content: NO_TRANSITIONS });
    await injectAxe(page);
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const a11y = storyContext.parameters?.a11y as { disable?: boolean; element?: string; config?: { rules?: unknown[] } } | undefined;
    if (a11y?.disable) return;
    if (a11y?.config?.rules) {
      await configureAxe(page, { rules: a11y.config.rules });
    }
    await settle(page);
    await checkA11y(page, a11y?.element ?? "#storybook-root", { detailedReport: false });
  },
};

export default config;

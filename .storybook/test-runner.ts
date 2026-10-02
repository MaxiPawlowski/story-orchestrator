import type { TestRunnerConfig } from "@storybook/test-runner";
import { getStoryContext } from "@storybook/test-runner";
import { injectAxe, checkA11y, configureAxe } from "axe-playwright";

const config: TestRunnerConfig = {
  async preVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const viewport = storyContext.parameters?.testViewport as { width: number; height: number } | undefined;
    await page.setViewportSize(viewport ?? { width: 1280, height: 720 });
    await injectAxe(page);
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const a11y = storyContext.parameters?.a11y as { disable?: boolean; element?: string; config?: { rules?: unknown[] } } | undefined;
    if (a11y?.disable) return;
    if (a11y?.config?.rules) {
      await configureAxe(page, { rules: a11y.config.rules });
    }
    await checkA11y(page, a11y?.element ?? "#storybook-root", { detailedReport: false });
  },
};

export default config;

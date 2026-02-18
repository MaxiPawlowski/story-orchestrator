import { tool } from "@opencode-ai/plugin"

const openByHeaderText = async (page: any, headerText: string) => {
  await page.evaluate((label: string) => {
    const headers = Array.from(document.querySelectorAll(".inline-drawer-header")) as HTMLElement[]
    const target = headers.find((node) => (node.textContent || "").includes(label))
    if (!target) return
    const icon = target.querySelector(".inline-drawer-icon")
    const expanded = !!icon && icon.classList.contains("down")
    if (!expanded) target.click()
  }, headerText)
}

const ensureExtensionsPanelOpen = async (page: any) => {
  await page.evaluate(() => {
    const icon = document.querySelector(".drawer-icon.fa-solid.fa-cubes.fa-fw.interactable") as HTMLElement | null
    if (!icon) return
    if (icon.classList.contains("closedIcon")) icon.click()
  })
}

export const openProjectStorySettings = tool({
  description: "Open ST Extensions panel and expand Project Story",
  args: {
    url: tool.schema
      .string()
      .default("http://127.0.0.1:8000/")
      .describe("SillyTavern URL"),
    timeoutMs: tool.schema
      .number()
      .int()
      .positive()
      .default(15000)
      .describe("Navigation and wait timeout in ms"),
    headless: tool.schema
      .boolean()
      .default(false)
      .describe("Run browser in headless mode"),
  },
  async execute(args) {
    const importDynamic = (0, eval)("(m) => import(m)") as (m: string) => Promise<any>
    const playwrightMod = await importDynamic("playwright")
    const browser = await playwrightMod.chromium.launch({ headless: args.headless })

    try {
      const page = await browser.newPage()
      await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: args.timeoutMs })

      await ensureExtensionsPanelOpen(page)
      await openByHeaderText(page, "Extensions")
      await openByHeaderText(page, "Project Story")

      await page.waitForSelector("#story-library-select", { timeout: args.timeoutMs })

      const status = await page.evaluate(() => {
        const extIcon = document.querySelector(".drawer-icon.fa-solid.fa-cubes.fa-fw.interactable")
        const projectHeader = Array.from(document.querySelectorAll(".inline-drawer-header")).find((node) =>
          (node.textContent || "").includes("Project Story"),
        )
        const projectIcon = projectHeader?.querySelector(".inline-drawer-icon")

        return {
          settingsPanelOpen: !!extIcon?.classList.contains("openIcon"),
          projectStoryExpanded: !!projectIcon?.classList.contains("down"),
        }
      })

      return JSON.stringify(
        {
          ok: true,
          ...status,
          url: args.url,
        },
        null,
        2,
      )
    } finally {
      await browser.close()
    }
  },
})

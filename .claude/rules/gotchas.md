# Gotchas

- **storyRuntimeController.ts** is a re-export stub (`export * from "@controllers/orchestratorManager"`) — not a real controller. The actual logic is in `orchestratorManager.ts`.
- **StoryOrchestrator.ts** method for manual evaluation is `evaluateNow()`, not `evaluateCheckpoint()`.
- **PresetService** creates a runtime-only preset named `Story:<storyId>`. It includes a retry loop (up to 20 attempts, 100ms delay) for UI slider sync because ST's DOM may not be ready immediately.
- **Arbiter responses** are parsed with fallback handling: tries raw JSON first, then extracts from markdown code fences.
- **TalkControl intercept** only aborts "loud" (not quiet) generations. Suppression depth counter and self-dispatch guards prevent recursion.
- **Build output** (`dist/`) is gitignored. Run `npm run build` before committing if the dist needs updating.
- **`global.d.ts`** imports ST type declarations from relative paths (`../../../../public/global`). These resolve at typecheck time against the ST repo structure.
- **Tailwind 4** uses `@tailwindcss/postcss` plugin (not classic `tailwindcss` PostCSS plugin). Config in `tailwind.config.js` + `postcss.config.js`.
- **Webpack fallbacks** explicitly disable `fs`, `http`, `https`, `url`, `crypto` (node builtins not available in browser target).

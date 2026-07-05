# Gotchas

- **`npm run lint` enumerates src dirs explicitly** (see package.json) — a new top-level `src/` dir is silently unlinted until added to the script. Same for tsconfig `include`.
- **In-page debug handle**: `globalThis.storyOrchestratorRuntime` (RuntimeManager) — `importStory(json)`, `runExtractionNow(response?, reason?)`, `getSnapshot()`. Plan 07 adds: `detectSceneBreak()`, `runSceneBreakPass(audit)`, `getEnabledCharacterIds()`, `runMemorizeBacklog(windowSize?)`, `setMemoryPinned(id, bool)`, `excludeMemoryEntry(id)`, `editMemoryEntry(id, text)`. Debug-response globals: `storyOrchestratorDebugExtractionResponse` (shared read), `storyOrchestratorDebugSceneSummaryResponse` (P2 scene-summary pass). Used by gate check scripts and ad-hoc `browser_evaluate`.
- **`so-state` reads persisted `chat_metadata`** — live in-page values between persist cycles may differ.
- **Settings panel root keeps legacy id `#stepthink_settings`** — debug selectors depend on it.
- **Jest runs `--runInBand`**; tests colocated as `src/**/*.test.ts`, excluded from tsconfig/lint.
- **`global.d.ts`** imports ST type declarations via relative paths into the ST repo (`../../../../public/global`) — resolves only inside the ST tree.
- **Tailwind 4** uses `@tailwindcss/postcss` plugin (not classic `tailwindcss` PostCSS plugin).
- **Webpack fallbacks** disable `fs`, `http`, `https`, `url`, `crypto` — no node builtins in browser target.
- **`dist/` is gitignored**; run `npm run build` before committing only if dist needs updating.

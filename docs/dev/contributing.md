# Contributing

Read [`architecture.md`](architecture.md) for the shape, then `.claude/CLAUDE.md` and `.claude/rules/*.md` for the
rules. The rules exist because each one was broken once; a change that touches a rule's area should read it first.

## Setup

The repository lives **outside** SillyTavern. SillyTavern's extension slot
(`public/scripts/extensions/third-party/story-orchestrator`) holds only a staged copy.

```bash
npm ci
npm run build                                   # the one bundle -> dist/ + dist/manifest.json
npm run stage -- --st-root <SillyTavern>        # copy the release file list into the slot
```

There is one build: it carries the debug handles (`globalThis.storyOrchestrator*`) the live harness uses. After
every build and stage, reload without the cache:

```bash
node scripts/debug/st-session.mts reload        # a plain reload can run the cached old bundle
```

The SillyTavern root can also come from `ST_ROOT` or a gitignored `.st-root` file; it is never guessed. `npm run
build` needs it too: the build manifest hashes every SillyTavern file the extension imports.

## Gates

Run the gates for what you touched, and report the exact commands and results.

| Change touches | Gates |
|---|---|
| docs only | none (the author's guide: `npm run docs:guide`, then `npm run test:release`) |
| pure modules (`engine/`, `extraction/`, `pacing/`, …) | `npm run typecheck && npm run lint && npm test` |
| build, release tooling, `tsconfig` | the above + `npm run build` + `npm run test:release` |
| runtime, UI, anything SillyTavern-facing | the above + a live check in a real SillyTavern (below) |

`npm run gates` runs the whole chain in order (typecheck, test typecheck, lint, jest, both builds, the harness tests,
release, replay, plugin and Storybook tests); `-- --no-storybook` skips Storybook and says so. Jest does not
type-check tests: run `npm run typecheck:test` when you change a test.

A failing gate is reported as failing. Mocked model responses are for unit determinism only; a change to anything
that calls a model is not done until it ran against a real model in the browser.

## The author's guide

`docs/authoring/story-guide.md` is the single source. `src/copilot/guideTopics.ts` is its compact twin (the Studio
and the wizard read it), and `guideTopics.test.ts` fails when the two drift. `docs/guide/author/` is generated from it:

```bash
npm run docs:guide      # rewrite the generated author pages and src/guide/pages.generated.ts
```

The fields go on one page per group (`docs/guide/author/fields/<group>.md`), each topic a `##` section anchored by its
id (`fields/moving-on.md#gates`). The groups live in `src/features/guideTopicGroups.json`, read by the split script and
by `authorGuideDoc`, so a new topic needs a group or the split fails. The in-app reader's sidebar follows the guide's
own index pages: the Play and Set up lists in `docs/guide/README.md` and the sections of the author README.

`scripts/docs/split-guide.test.mjs` (part of `npm run test:release`) fails when the generated pages are stale.

## Live debugging

`scripts/debug/*.mts` drive a real SillyTavern over CDP: state reads, UI actions, scenarios, journeys, parallel
lanes. Start with [`scripts/debug/README.md`](../../scripts/debug/README.md) and the `debug` skill in
`.claude/skills/debug/`. Artifacts go to a debug folder outside SillyTavern's `public/` (they contain chat text).

## Style

- TypeScript strict; match the surrounding idiom; no code comments.
- `src/services/STAPI.ts` and `src/services/stHost/*` are the only files that import SillyTavern modules.
- `src/engine/**` stays pure.
- UI parts get a `.stories.tsx` with interaction and accessibility checks.
- User-facing text is plain words, consequence first. No repo paths, plan ids or raw ids in the UI.
- Colours, controls, layouts, copy and screenshots follow the [style guide](style.md): SillyTavern theme variables
  only, the quote accent for Story and the em accent for Orchestrator, 44px controls, native dialogs, one save
  vocabulary.

## Commands

- `npm run build`: the one bundle into `dist/` + `dist/manifest.json`, with the debug handles; the main entry must
  stay within 1,300,000 bytes (the build fails over it), so new code goes into lazy chunks. `npm run test:release`
  checks the manifest against the bytes it describes.
- `npm run notices` regenerates `THIRD-PARTY-NOTICES.md` from the prod module list; `npm run inventory -- --data-root
  <data>/<user>` lists what the extension owns in a SillyTavern data root, read-only.
- `npm run storybook` / `npm run test-storybook:ci`: UI, with the runner invoked by path so it works on Windows shells
  and in CI.
- `npm run test:debug` / `npm run test:plugin` / `npm run test:release`: the harness, the server plugins and the
  release tooling (plus the generated guide), each on `node --test`.
- `scripts/release/clean-host.sh` (and `.ps1`): clone SillyTavern at a pinned revision into a temp dir, copy this
  extension in without `node_modules`/`dist`, `npm ci` with an isolated cache, run the gates, and write a host record.
- `npm run plugin:install -- --st-root <SillyTavern>`: copy the server plugins into SillyTavern's `plugins/`.

## Releases

`npm run package` builds `release/story-orchestrator-<version>.zip` from `scripts/release/artifact-allowlist.json`
and refuses a dirty tree. `package.json`, `manifest.json`, `dist/manifest.json` and the top versioned heading of
`CHANGELOG.md` must name the same version (`npm run test:release`).

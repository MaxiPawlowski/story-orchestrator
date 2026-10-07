# Companion plugin maintenance

User request, 2026-10-04: keep every installed Story Orchestrator server plugin's source in this repository and
make its relationship, packaging and installation explicit.

Reused `SERVER_PLUGINS` in `scripts/lib/pluginInstall.mjs`: installation, release plugin-version metadata and
release inventory now share that registry.

2026-10-07: the installer decides by content, never by version. A same-version plugin with changed files used to read
`unchanged` and stay stale (GPU and media in the real SillyTavern needed `--force`). Each shipped file (everything in
the plugin folder except `*.test.mjs`, `README.md`, `fixtures/`, `node_modules/` and the local `config.json`) is
compared by sha256; only differing files are copied (`update`), identical plugins are `unchanged`. The downgrade
refusal and `--force` are gone. Judge installs by default and `--with` adds optional plugins, as before; an optional
plugin already present under `<ST>/plugins/` is always checked and kept in sync, and `--check` lists its differing
files and exits 2. Media is included in both release consumers. Regression checks cover
media inventory, registered package versions and unregistered source directories. The root README documents all
four companions; GPU and harness READMEs reflect current adapters and installation flags.

## Gate record

2026-10-04:

- `node --test scripts/lib/pluginInstall.test.mjs scripts/release/inventory.test.mjs && npm run test:plugin`:
  installer/inventory 8 passed; plugin suite 100 passed, 3 opt-in live tests skipped, 0 failed.
- `npm run gates -- --no-storybook`: all selected steps green: typecheck, typecheck:test, lint, test, build,
  build:dev, test:debug, debug:typecheck, test:release, test:replay and test:plugin. Release suite: 94 passed,
  2 skipped, 0 failed; defect replay: 32/32 killed. Storybook explicitly skipped (tooling/docs change).
- `npm run plugin:install -- --with gpu,media,harness && npm run plugin:install -- --with gpu,media,harness --check`:
  media runtime files synchronized at 2.8.0; judge 1.6.0, GPU 0.1.0 and harness 1.2.0 already matched. Final check:
  every plugin `unchanged`, exit 0. Local configuration files preserved; server plugins enabled.
- SillyTavern restart required to load synchronized media code. No live acceptance claimed; no release zip
  produced (the working tree contains ongoing work). Builds generated locally, not staged into SillyTavern.

2026-10-07 (content-based install):

- `npm run gates -- --no-storybook`: all green (typecheck, typecheck:test, lint, test 6962 passed / 1 skipped, build,
  test:debug 1158 passed, debug:typecheck, test:release, test:plugin, defect replay 32/32 killed). Storybook skipped
  (tooling/docs change).
- CLI smoke against a temp fake ST root only (never the real ST): `--check` exit 2 listing differing files of judge
  (install) and an already-present media (update), install, then `--check` exit 0, local `config.json` intact.

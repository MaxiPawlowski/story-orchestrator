# Companion plugin maintenance

User request, 2026-10-04: keep every installed Story Orchestrator server plugin's source in this repository and
make its relationship, packaging and installation explicit.

Reused `SERVER_PLUGINS` in `scripts/lib/pluginInstall.mjs`: installation, release plugin-version metadata and
release inventory now share that registry. Media is included in both release consumers. Regression checks cover
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

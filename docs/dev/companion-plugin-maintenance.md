# Companion plugin maintenance

Every Story Orchestrator server plugin lives in this repository under `server-plugin/<name>/`, with its own
`package.json`, `README.md` and `*.test.mjs` files. One registry, `SERVER_PLUGINS` in `scripts/lib/pluginInstall.mjs`,
lists them; the installer (`scripts/plugin-install.mjs`), the release plugin-version metadata (`pluginVersions`) and
the release inventory (`scripts/release/inventory.mjs`) all read it, so a plugin missing from it is not installed and
not inventoried.

| Plugin | Installed by default | Optional (`--with`) |
|---|---|---|
| `story-orchestrator-judge` | yes | |
| `story-orchestrator-lore` | yes | |
| `story-orchestrator-gpu` | | `gpu` |
| `story-orchestrator-harness` | | `harness` |
| `story-orchestrator-media` | | `media` |

## How the installer decides

- It compares **content, never versions**: each shipped file (everything in the plugin folder except `*.test.mjs`,
  `README.md`, `fixtures/`, `node_modules/` and the local `config.json`) is compared by sha256, and only differing
  files are copied (`update`); identical plugins are `unchanged`.
- An optional plugin already present under `<SillyTavern>/plugins/` is always checked and kept in sync, even without
  `--with`.
- `--check` writes nothing, lists each differing file and exits 2 when anything differs.
- A local `config.json` is never touched. The harness plugin's own dependency is installed in its own folder
  (`--skip-deps` leaves that to you).
- It warns when `enableServerPlugins` is off in SillyTavern's `config.yaml`, and SillyTavern loads plugin changes only
  after a restart.

## Changing a plugin

1. Edit the plugin under `server-plugin/<name>/` and its tests beside it.
2. Bump the plugin's `version` in its `package.json` (release metadata reads it; the installer does not).
3. Update the plugin's `README.md`: keep its opening table (who needs it, install, enable, configure, how to tell it
   works, the user guide link) true, and the user guide page it links to.
4. Run `npm run test:plugin` and `node --test scripts/lib/pluginInstall.test.mjs scripts/release/inventory.test.mjs`,
   then the full `npm run gates` before merging.
5. Install into a SillyTavern copy you are allowed to change (a lane, never someone's live install while they play):
   `npm run plugin:install -- --with gpu,media,harness`, then `-- --check` must exit 0. Restart that SillyTavern.

## Adding a plugin

1. Create `server-plugin/story-orchestrator-<name>/` with `index.mjs`, `package.json` (`"type": "module"`), a
   `README.md` with the same opening table as the others, and tests.
2. Add it to `SERVER_PLUGINS` (`optional: true` unless every install needs it) and add a regression case to
   `scripts/lib/pluginInstall.test.mjs` and `scripts/release/inventory.test.mjs`.
3. Add it to the plugin table in the root `README.md` and to [Server plugins](../guide/setup/README.md#server-plugins).
4. Run the checks in step 4 above.

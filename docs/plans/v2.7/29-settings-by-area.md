# Plan 29 — Settings by area

**Status (2026-10-07): SEEDED from the user (2026-10-07: "I really liked how the readme was structured, maybe we can
put the settings like that?"); applies the v2.7 01 triage; needs user approval of the triage table; not built.**
Overview: `00-overview.md`. Gate tier: D (implementation and acceptance; no model input changes).

## Problem

The settings panel (`src/components/settings/SettingsPanel.tsx:160-205`) is a column of 14 groups in build order:
story, memory model, display, images, sprites, lorebooks, stagecraft, judge, talk, pacing, capabilities. A player
cannot tell which groups matter to play, which are setup, and which are author tuning. The README's Features table
(`README.md:64-83`) already says the same things in eight areas, one line each, and reads well.

## Player outcome

The panel reads like the README: Start/Continue/Repair/Author on top (unchanged, `EntryPoints.tsx`), then one
section per area with a one-line description, the controls a player uses visible, everything else behind one
"Advanced" fold per section. Each section and control has a "?" that opens its guide page (v2.7 30).

## Design

1. **Areas are the registry's areas**, not a second list. `src/features/registry.ts` already tags every feature
   `area: play | memory | characters | world | judge | authoring | setup` (`registry.ts:99-443`). The README table is
   generated from the same registry (v2.7 01 close-out step Z), so README, Help and settings cannot drift.
   Rename for display only: Playing, Memory, Characters, World, Images (split `images`/`sprites`/`backgrounds` out of
   world), Judge, Authoring, Setup.
2. **One section component** (`SettingsArea`): heading, the area's one-line description from the registry
   (`settingsCopy.ts`), visible controls, `<details>` Advanced, and the guide link. Existing group components
   (`PlayGroups.tsx`, `MemoryModelGroup`, `ImageGroup`, `JudgeSettingsGroup`…) are re-homed, not rewritten.
3. **Audience decides placement:** `player` visible; `setup` visible in Setup; `author` visible only with Author view,
   otherwise absent (author view adds, never conditionally reveals; invariant). Lazy groups stay lazy.
4. **Apply the triage** (`01-docs-and-in-app-guidance.md` §Triage proposal, ~40 rows): `keep` / `advanced` /
   `dev-only` (behind `__SO_DEV__`, out of the release build) / `fixed default` (control **and** setting key removed,
   no-legacy rule). Rows for features added since 2026-10-03 (image route, sprite builder, mouth region, edit
   resolution, animated faces, card fields) are added to the table before the review.
5. **Repair reveal keeps working**: `revealSetting` targets by id; every id the check registry names
   (`runtime/checks.ts`, `checksSetup.ts`) must still resolve (test).

## Gates (D)

- Registry test: every settings control belongs to exactly one registry feature and area; every area has copy.
- Reveal test: every `target` a check can emit resolves to a mounted element in the matching audience.
- Removed `fixed default` keys: `getGlobalSettings` drops them; a stored value is ignored (jest).
- `dev-only` rows absent from the prod bundle (release inventory test).
- Storybook: `SettingsPanel` per persona (player, author) + a11y; `so-ui.mts assert-player-clean` on the live panel.
- Phase C live: settings round-trip (change → reload → read back) on a lane, ×2.

## Order

After v2.7 30's page ids exist (the "?" links), before 32–38 add controls (each later plan places its controls by
area from day one).

## Decisions for the user

1. Approve the triage table (v2.7 01 §Triage proposal) with the new rows. **Recommended: yes, as proposed.**
2. Images as its own area (split from World)? **Recommended: yes** — it is the largest optional setup.
3. Remember which sections are open per install (`localStorage`-free: extension settings)? **Recommended: yes.**

## Links

`01-docs-and-in-app-guidance.md` §D/§Triage proposal, `30-in-plugin-guide.md`, `README.md` §Features,
`src/features/registry.ts`, `src/components/settings/SettingsPanel.tsx`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. The v2.7 01 triage table is approved as proposed; new rows added at build.

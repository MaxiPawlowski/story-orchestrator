# Plan 27 — Gamification prior art: Obsidian TTRPG tooling, PKM gamification, quest logs

**Status: SEEDED 2026-10-07 from the user's idea list; needs user approval; not run.** Gate tier: docs only (a report
and per-repo notes; nothing in `src/` changes). Overview: `00-overview.md`. User idea (00-overview tail): "I recently saw
that there's a big community around building gamification over tools like obsidian. What are the most populars or
trending ones? shall we plan a big deep dive cloning a bunch of repos and reviewing if there's any pattern we could
harvest for our plugin?"

## Question

Which quest, progress, stat, dice, clock, calendar, map and journal models from the Obsidian / PKM / VTT gamification
community fit our game layer (typed blackboard, seeded chance, rollback, player vs author views, group chats only), and
which would be traps?

## Why now (consumers)

- v2.7 36 (quests and story panels, being written): Q1 quests, Q2 visible qualities, Q3 visible checks, Q4 milestones,
  Q5 quest log + rewards, W widget layer, P panels/chips. Its schema is still open, so prior art is cheapest now.
- v2.7 37 (character life, was v2.8 20): relationships, mood, agendas, whereabouts/schedules (calendar, clocks).
- v2.7 35 (world pressure, open stretches) and v2.8 22 (living story director): clocks, oracles, random events.
- v2.8 04 (Journal, stat sheet, public roll chips) and v2.8 23 (story widgets) for what 36 does not absorb.

## Scouting done for this seed (2026-10-07)

Stars, last push and licence from the GitHub API (`gh api repos/<o>/<r>`), web search for popularity. "Other" = GitHub
could not name the licence; read the file at clone time. Tier = proposed clone priority.

| # | Repo | ★ | Push | Licence | Pattern on offer | Consumer | Tier |
|---|---|---|---|---|---|---|---|
| 1 | `iron-vault-plugin/iron-vault` (Ironsworn/Starforged) | 110 | 2026-09-20 | Other | vows = quests with rank + progress boxes, progress rolls, clocks, oracles, moves, character sheet; all state in note frontmatter | 36 Q1/Q3/Q5, 35 | 1 |
| 2 | `Obsidian-TTRPG-Community/fantasy-statblocks` | 494 | 2026-01-21 | MIT | declarative stat-block schema + layouts rendered from YAML | 36 Q2/W, 04 stat sheet | 1 |
| 3 | `Obsidian-TTRPG-Community/dice-roller` | 343 | 2025-03-24 | none listed | dice notation grammar, inline result rendering, roll on tables | 36 Q3, roll chips | 1 |
| 4 | `Obsidian-TTRPG-Community/initiative-tracker` | 223 | 2026-04-12 | GPL-3.0 | turn order, HP, conditions with durations, encounter state | 37, 36 Q2 | 1 |
| 5 | `javalent/calendarium` | 154 | 2025-09-27 | MIT | fantasy calendar, current date, events, moons | 37 schedules, 22 | 1 |
| 6 | `Forien/foundryvtt-forien-quest-log` (Foundry VTT) | 25 | 2025-05-02 | MIT | quest log: objectives, rewards, status lanes, GM-only vs player-visible fields | 36 Q1/Q5, spoiler rules | 1 |
| 7 | `ironmonk108/monks-enhanced-journal` (Foundry) | 63 | 2026-09-14 | GPL-3.0 | typed journal pages: quest, encounter, person (relationships), shop | 36 Q5, 37 | 1 |
| 8 | `HabitRPG/habitica` | 14185 | 2026-10-05 | Other (GPL-3.0 code, CC art; check) | the canonical model: XP, gold, levels, party quests (boss HP from members' work), penalties | 36 Q4/Q5 rewards, group party | 1 (sparse) |
| 9 | `martinellison/mythic-gme-support` | 3 | 2026-10-05 | Other | Mythic GM emulator: chaos factor, fate question, random events | 35, 22 | 1 |
| 10 | `tokenshift/obsidian-progress-clocks` | 10 | 2025-01-20 | MIT | Blades-style segmented clocks + counters as code blocks | 35, 36 W | 1 |
| 11 | `saertna/obsidian-gamified-pkm` | 67 | 2026-07-13 | MIT | XP for note maturity, badges, levels | 36 Q4 | 1 |
| 12 | `Snifer/LifeQuest` | 4 | 2026-07-12 | 0BSD | quests with difficulty, XP, streaks, weekly review dashboard | 36 Q5, recap | 2 |
| 13 | `johannes-kaindl/kuro-gamification` | 0 | 2026-10-03 | AGPL-3.0 | deterministic loot, streak freeze tokens, no-punishment design | 36 rewards, `chance.ts` | 2 |
| 14 | `obsidian-tasks-group/obsidian-tasks` | 4042 | 2026-10-04 | MIT | task status model, recurrence, query language | 36 Q1 status, Q5 filters | 2 |
| 15 | `blacksmithgu/obsidian-dataview` | 9379 | 2025-11-17 | MIT | queries over typed fields → tables/lists | 36 W `bind` | 2 |
| 16 | `callumalpass/tasknotes` (trending, top-5 downloads Aug 2026) | 2196 | 2026-10-06 | MIT | task-as-note, status workflow, views | 36 Q5 | 2 |
| 17 | `community-archive/obsidian-kanban` | 4525 | 2026-03-06 | GPL-3.0 | lanes as status | 36 P quest board | 2 |
| 18 | `javalent/obsidian-leaflet` | 714 | 2025-07-09 | none listed | image maps + markers | map panel (unplanned) | 2 |
| 19 | `vigoren/foundryvtt-simple-calendar` | 70 | 2025-05-12 | MIT | world clock, time advance, notes on dates | 37, 22 | 2 |
| 20 | `owlchester/kanka` | 358 | 2026-10-05 | Other | campaign manager: quests, relations, calendars, per-entity visibility | 36, 37 | 2 |
| 21 | `Snifer/opse-oracle-ttrpg` | 2 | 2026-05-23 | MIT | One Page Solo Engine oracle | 35, 22 | 2 |
| 22 | `dromse/obsidian-gamified-tasks` | 97 | 2026-03-13 | MIT | points per task, reward shop | 36 rewards | 3 |
| 23 | `inkle/ink` / `klembot/twinejs` | 4961 / 2900 | 2026 | MIT / GPL-3.0 | IF state: visit counts, storylets, choice gating | engine (compare only) | 3 |
| 24 | `Richardsl/heatmap-calendar-obsidian`, `SuperChamp234/habitica-sync`, `c6p/logseq-habit-tracker`, `tiddly-gittly/tw-gamification` | 962 / 112 / 120 / 7 | 2024–2026 | Apache-2.0 / MIT / MIT / MIT | streak heatmap, Habitica bridge, Logseq habits, TiddlyWiki event→reward pipeline | low | 3 |

Not on the list on purpose: the most-downloaded Obsidian plugins (Excalidraw, Templater, Claudian) are not
gamification. Solo RPG Toolkit and Solo TTRPG Notation (Lonelog) are popular solo-play plugins whose repos were not
located in scouting; find them in step 1. Logseq and Notion-likes have little gamification code; one Logseq row is
enough to say so.

## Method

1. **Confirm popularity** (1 h): Obsidian community download counts from obsidianstats.com for rows 1–5, 10–18;
   the Obsidian TTRPG Community plugin list; locate the two solo-play repos. Freeze the list (decision 1).
2. **Clone** (30 min) shallow into `C:\dev\st-extensions-research\gamification\<repo>\source` (`git clone --depth 1`;
   Habitica with `--filter=blob:none --sparse`, only its quest/scoring/party code, the repo is ~1.6 GB). Write a
   `gamification\README.md` index (repo, commit, date, ★, licence, files) like the corpus README. Nothing installed.
3. **Review** each tier-1/2 repo into one note (`docs/plans/v2.8/gamification-research/<repo>.md`, v2.4 report shape:
   what it is, how it works with `file:line`, overlap with us, ideas table, copy / avoid). Tier 3: one paragraph each.
   Parallel review agents are fine; one summary pass reads every note.
4. **Map** each idea to our model: blackboard quality, seeded `chance`, gate, effect, snapshot read model, widget.
5. **Summarise** into the report and candidate rows.

## Rubric (per pattern)

| Column | Values |
|---|---|
| kind | data model / mechanic / UI / authoring format / anti-pattern |
| maps to | quality, roll, gate, transition, milestone, quest, widget, journal, director signal |
| determinism | pure from state / needs seeded draw / needs a model call (reply path = refuse) |
| rollback | derivable from stores that roll back / needs its own ring / unrollbackable (refuse) |
| visibility | player-safe / author-only / spoiler risk (hidden objectives, secret rolls) |
| group fit | works with N members and one player / solo-only (refuse, v2.7 03) |
| authorable | expressible in the story format (declarative) vs needs code |
| value 1–5, effort S/M/L, destination plan + row | as v2.4 |

Watch for: punishment loops (Habitica damage) that fight player agency (`DEFAULT_AGENCY`); grind/streak mechanics that
reward session length; XP for model-judged prose (no floor, unmeasured).

## Deliverable

- `docs/plans/v2.8/27-gamification-report.md`: ranked repo table (pinned commits), pattern table (rubric columns),
  copy / avoid lists, and **candidate rows** grouped by consumer: v2.7 36 (Q1–Q5, W, P), v2.7 37, v2.7 35, v2.8 22,
  v2.8 04/23, and "new plan" seeds (map panel, calendar/clock). Rows are proposals; consumer plans change only on the
  user's decision.
- Per-repo notes in `docs/plans/v2.8/gamification-research/`; clone index in the corpus folder.

## Effort

About 2.5–3 days of agent time: step 1 1 h, clones 30 min, 11 tier-1 notes ~45 min each (~8 h), 10 tier-2 notes
~25 min each (~4 h), tier 3 1 h, summary 3 h. No model calls, no lane, no pod. Trim to tier 1 only: ~1.5 days.

## Risks

- **Licence:** this repo is AGPL-3.0. Patterns only by default. Code reuse only from a licence compatible into AGPL-3.0
  (MIT, 0BSD, Apache-2.0, GPL-3.0, AGPL-3.0), named in the consumer plan with source commit and file. "Other" or no
  licence (iron-vault, dice-roller, leaflet, habitica, kanka, mythic) = patterns only until the file is read. Game
  rules (Ironsworn, Mythic, OPSE, Blades) carry their own content licences: describe mechanics, never copy rules text,
  oracle tables or art. Record each licence in the index.
- **Stale stars:** a high ★ count can mean an old, abandoned plugin; activity is a column for that reason.
- **Fit:** most repos model a solo user's tasks, not a party in a story; the group-fit column filters that.
- Spoilers: none (no campaign content; Adolion is not read).
- Scope creep into building: the report proposes; it builds nothing.

## Decisions for the user

1. Candidate list: **recommend tiers 1+2 (21 repos)**, tier 3 as one-paragraph mentions.
2. Include Foundry VTT modules and Kanka (not Obsidian)? **Recommend yes**: their quest logs and per-field player/GM
   visibility are the closest prior art to v2.7 36's spoiler rules.
3. Habitica sparse clone of quest/party/scoring code only? **Recommend yes.**
4. Timing: run before v2.7 36's schema is approved? **Recommend yes, tier 1 first** (~1.5 days), tier 2 after.
5. Per-repo notes in this repo (`docs/plans/v2.8/gamification-research/`) like v2.4, or only the summary?
   **Recommend notes in-repo** (v2.4 precedent); clones stay outside.

## Links

- Precedent: `C:\dev\st-extensions-research\README.md`, `FORUM-INDEX.md`; `docs/plans/v2.4/extension-research/`;
  `docs/plans/v2.7/23-local-residency-freetoken.md`
- Consumers: `docs/plans/v2.7/36-quests-and-story-panels.md`, `docs/plans/v2.8/18-quests-and-game-layer.md`,
  `04-story-presence-panels.md`, `20-character-life.md`, `22-living-story-director.md`, `23-story-widgets.md`
- Web: <https://www.obsidianstats.com/posts/2026-08-11-ttrpg-plugins>, <https://plugins.javalent.com/>,
  <https://community.obsidian.md/plugins/lifequest>, <https://community.obsidian.md/plugins/kuro-gamification>,
  <https://community.obsidian.md/plugins/gamified-pkm>, <https://community.obsidian.md/plugins/iron-vault>,
  <https://obsidianstats.com/plugins/progress-clocks>, <https://community.obsidian.md/plugins/opse-oracle>

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.

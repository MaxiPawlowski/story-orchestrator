# How a World Info scan actually runs (source walk)

Open this when behaviour surprises you and the official doc doesn't explain it: why an entry was
dropped, why order or priority came out differently, what the scan buffer contains, what timed effects
count. It follows `checkWorldInfo` (`public/scripts/world-info.js:4709-5282`) in order. Paths are
under `C:\dev\SillyTavern-MainBranch\`.

## 0. When a scan happens

- Every `Generate()` call builds the scan chat and calls `getWorldInfoPrompt` (`script.js:4624-4635`).
  That covers normal, continue, impersonate, swipe and regenerate, plus **quiet** generations: `/gen`
  goes through `generateQuietPrompt` (`slash-commands.js:4514`), which calls `Generate('quiet')`
  (`script.js:3108`). The `sd` extension's prose-to-prompt call goes through the same path, so image
  prompts see World Info too.
- **Our extension's LLM passes don't scan.** They go through
  `ConnectionManagerRequestService.sendRequest` (`src/services/stHost/connectionProfiles.ts:44`), which
  builds a raw chat or text completion request with no World Info step (`public/scripts/extensions/shared.js:423-482`).
- ST also runs a dry-run scan (`isDryRun=true`) for token counting. Dry runs don't set timed effects
  (`731`) and don't emit `WORLD_INFO_ACTIVATED` (`900-903`).

## 1. Which entries are candidates

`getSortedEntries` (`4590-4644`) gathers global, character, chat and persona lore. It then emits
`WORLDINFO_ENTRIES_LOADED` with the four mutable arrays (`4604`), which an extension can push into.
Sort order:

1. Chat lore (sorted by `order`, descending).
2. Persona lore (sorted by `order`, descending).
3. Character and global lore, combined according to `world_info_character_strategy`: evenly (0),
   character first (1, the default), or global first (2). Each group is sorted by `order`, descending.

This sorted list is the **priority order** when the budget runs short.

Decorators are then parsed from the start of `content` (`4628-4630`, `parseDecorators`
`4652-4698`). Every leading line that begins with `@@` is consumed. `@@activate` and `@@dont_activate`
are the known ones (`100`). An `@@@x` line is a fallback that's used only when the preceding decorator
was unknown. Each entry also gets a hash of its whole JSON (`4631-4633`), which timed effects use.

## 2. The scan buffer

- Messages come in newest first. With Include Names on, each is `Name: text` (`script.js:4624`).
- Messages with `is_system` set are excluded: hidden messages and `/comment` notes
  (`script.js:4496`, `slash-commands.js:6118`).
- A **swipe** drops the message being swiped from the scan (`script.js:4497-4499`).
- Text is the **prompt-regexed** version. User Input and AI Output regex scripts that alter the
  outgoing prompt apply *before* the scan (`script.js:4501-4506`).
- `buffer.get` joins the first `scanDepth` messages with `\n\x01` and prefixes the result with `\x01`
  (`295-297`). **A depth of 0 or less returns `''` immediately** (`280-283`), before it would append
  anything else. The official doc says Author's Note and recursion still match at depth 0. They don't.
  A dry run (2026-09-18) confirmed that an entry with `scanDepth: 0` didn't match a key sitting in the
  newest message, while `scanDepth: 1` did.
- Appended after the messages, in this order: the entry's additional matching sources (`299-316`);
  the **inject buffer**, meaning every extension prompt registered with `scan: true` (`4719-4726`),
  which includes the quiet prompt of a quiet generation (`script.js:4623`), the Author's Note when
  "allow WI scan" is on, and Data Bank injections set to "Include in World Info Scanning"; and the
  recursion buffer, except during min-activations sweeps (`322-325`).
- **Three of our blocks are registered with `scan: true`** while `worldInfo.scanMemory` is on (the
  default): established facts, scene history and checkpoint guidance (`src/constants/injectionRegistry.ts:16`,
  `19`, `25`, `src/services/stHost/extensionPrompts.ts:44-51`), so their text can trigger an entry.
  Every other block, and private per-member knowledge, is `scan: false` (lorebook-mechanics.md §14.8).

## 3. Per-entry gate, in order (`4796-4989`)

1. Skip it if it already activated or already failed a probability roll during this generation.
2. `disable` means skip.
3. `triggers` is set and doesn't include the current generation type: skip.
4. `characterFilter.names` compared with `getCharaFilename()` (the avatar file name). `isExclude` inverts it.
5. `characterFilter.tags` compared with the current character's tag ids.
6. Active **delay** means skip. Active **cooldown** means skip unless the entry is sticky.
7. `delayUntilRecursion` outside a recursion pass, or above the current recursion level, means skip
   (unless sticky).
8. `excludeRecursion` during a recursion pass, with recursion enabled, means skip (unless sticky).
9. `@@activate` activates. `@@dont_activate` skips.
10. Force-activated through `WORLDINFO_FORCE_ACTIVATE` (`1020-1026`, needs `world` and `uid`)
    activates. Vector Storage uses this path (`extensions/vectors/index.js:1725`).
11. `constant` activates. **Keys and secondary keys aren't looked at.**
12. Active sticky activates.
13. No `key` entries means skip.
14. Primary: the first key that matches wins. Each key is macro-substituted and trimmed. **An empty
    result never matches** (`4914-4917`).
15. Secondary (only with `selective` on and a non-empty list): AND_ANY, NOT_ALL, NOT_ANY, AND_ALL
    (`4943-4978`).

### Key matching (`matchKeys`, `337-366`)

- `/pattern/flags` (flags `gimsuy`) is a regex. It **overrides** the case-sensitive and whole-words
  settings (`338-342`), so add `i` yourself. An unescaped `/` inside the pattern makes the whole key
  plaintext, without any warning (`parseRegexFromString`, `2901-2926`).
- Plaintext keys are lowercased unless case-sensitive is on.
- Whole words: a multi-word key is a **plain substring match** (`350-353`), so `dark sin` matches
  "dark sinews". A single-word key uses `(?:^|\W)key(?:$|\W)` (`356`). `\W` is ASCII-only, so an
  accented letter counts as a boundary: `caf` matches "café". The 2026-09-18 dry run confirmed both
  cases, and confirmed that `king` does *not* match "liking".

## 4. After a loop's candidates are collected

- Candidates are sorted: sticky first, then by position in the sorted list from section 1
  (`4995-5003`). **Constant entries get no special priority.** The official doc says they're inserted
  first. The code doesn't do that.
- **Inclusion groups** (`filterByInclusionGroups`, `5388-5475`), per group label:
  - Sticky members win outright.
  - Members on cooldown or delay are removed.
  - Group scoring, when enabled globally or on any member, keeps only the members with the highest
    key-match count (`getScore` `428-473`, `5292-5328`).
  - If this group already has a winner from an earlier loop, everything else is dropped.
  - Otherwise a prioritized member (`groupOverride`) with the highest `order` wins, or a winner is
    drawn at random by `groupWeight`.
- **Probability**: rolled for each entry that remains (`5028-5055`).
- **Budget**: `budget = round(world_info_budget% × maxContext / 100)`, capped by `world_info_budget_cap`
  (`4736-4741`). Each entry's content is macro-substituted (`5058`). Tokens of all activated text so
  far are counted. Once the next entry would exceed the budget, overflow is set: the rest are skipped
  unless they have `ignoreBudget`, and recursion stops (`5061-5073`, `5097`).

## 5. Recursion and extra passes (`5096-5147`)

- If recursion is on, the budget hasn't overflowed, and there are new entries without
  `preventRecursion`, their macro-substituted content goes into the recursion buffer and the scan loops
  again with the state set to recursion.
- Delayed-recursion levels are opened one at a time, from the lowest number up (`5128-5133`).
- If min activations isn't met, the depth advances by one and the scan repeats (`5109-5126`).
- Max recursion steps caps the number of loops (`4768-4771`).
- Each loop emits `WORLDINFO_SCAN_DONE` with mutable state (`5149-5186`).

## 6. Building the prompt (`5189-5263`)

- Activated entries are sorted by `order` descending, and each one is `unshift`ed into its slot. The
  result is **ascending order within a slot**: order 10 comes before order 200. The dry run confirmed
  this. **Outlets are the exception**: their text is `push`ed, so the higher `order` comes first
  (`5248-5256`).
- **World Info regex scripts** (placement 5, `extensions/regex/engine.js:290`) run now, with `depth`
  set for @D entries (`5204-5205`). That's *after* activation, so recursion saw the un-regexed text.
- Empty content is dropped. @D entries are grouped by `(depth, role)` (`5235-5246`) and injected in
  the chat as extension prompts (`script.js:4668-4672`). Outlets are stored under
  `{{outlet::name}}` (`script.js:4674-4677`).
- The Author's Note positions (2/3) are spliced into the Author's Note **only when `shouldWIAddPrompt`
  is true** (`5268-5272`). That flag is false outside a chat, when the Author's Note interval is 0, on
  off-interval turns, and before the first user message unless the interval is exactly 1
  (`authors-note.js:324-362`).
- Chat Completion puts the ↑Char/↓Char text at the Prompt Manager markers `worldInfoBefore` and
  `worldInfoAfter`, wherever you've dragged them (`openai.js:1376-1377`), and wraps it in the World
  Info format template `{0}` (`openai.js:789-801`). Text Completion uses `{{wiBefore}}` and
  `{{wiAfter}}` in the story string (see `.claude/sillytavern-docs/context-template.md`).

## 7. Timed effects (`WorldInfoTimedEffects`, `479-793`)

- State lives in `chat_metadata.timedWorldInfo.{sticky,cooldown}[`${world}.${uid}`] = {hash, start, end, protected}`.
  `start` is the scan-chat length at activation. `end` is `start + N` (`604-611`).
- **An effect is matched to its entry by hash** (`624`), and the hash covers the whole entry JSON
  (`4631-4633`). Any save that changes the entry **suspends** its running sticky or cooldown: the old
  record stops matching but still sits under `world.uid`, so a new one cannot be armed (`718`) until the
  old `end` passes and it is swept (`632-637`). That includes file-mode gate toggles, curator writes and
  `upsertWIEntry` rewrites; scan-mode gating changes only the scan copy's hash (lorebook-mechanics.md §7,
  §14.3).
- An effect is removed when the chat hasn't advanced past `start`, for example after a swipe or a
  delete (`626-629`).
- When sticky ends, cooldown starts immediately (`518-529`).
- `delay` means "the scan chat has fewer than N messages" (`672`). The scan chat has no system or
  hidden messages, so `/comment` notes don't count toward it.
- `/wi-set-timed-effect` and `/wi-get-timed-effect` read and write this state (`1449-1563`). The entry
  must already have a duration set.

## 8. Events you can hook (`public/scripts/events.js`)

| Event | When | Payload / use |
|---|---|---|
| `WORLDINFO_ENTRIES_LOADED` | before sorting, every scan | `{globalLore, characterLore, chatLore, personaLore}`, mutable. Handy for a non-persistent test injection |
| `WORLDINFO_SCAN_DONE` | after each loop | mutable `state`, `activated`, `budget`, `recursionDelay` |
| `WORLD_INFO_ACTIVATED` | after a non-dry scan | the activated entries. Quick Reply automation ids listen here (`extensions/quick-reply/index.js:302`) |
| `WORLDINFO_FORCE_ACTIVATE` | you emit it | entries with `world` and `uid`, force-activated on the next scan |
| `WORLDINFO_UPDATED` | after a book save | `(name, data)` (`4160`) |
| `WORLDINFO_SETTINGS_UPDATED` | global selection or settings changed | none |

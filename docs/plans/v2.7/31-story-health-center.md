# Plan 31 — One health center while a story is active

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

The user's question: we keep adding checks on the environment (SillyTavern settings, other extensions, backends),
and many of them notify the user separately when something needs doing. Should there be one central place, active
when a story is playing in a chat?

## The scatter today

| Check | Where it lives | How it reaches the user |
|---|---|---|
| The ONE missing step (memory model → cast → lore → persona → save) | `runtime/repair.ts` | Repair entry point, HUD `#so-hud-pipeline` chip, drawer |
| Story requirements (members, lorebooks, persona) | `runtime/requirements*.ts` | author-view requirements panel, "Fix with wizard" |
| Host capabilities (macros, slash, vectors, judge) | `stHost/capabilities.ts` | settings → Host capabilities group |
| Memory self-test | `MemoryModelGroup.tsx` | settings button, PASS/FAIL rows |
| Judge readiness, calibration, privacy | `judge/readiness.ts` | Judge settings group |
| Pipeline state (reading, stalled, error, not configured) | `runtime/pipeline.ts` | HUD chip, drawer Overview |
| Save health | `runtime/saveHealth.ts` | pipeline text |
| Globally selected story books | `runtime/storyLore.ts` | its own Repair row |
| Mirror book left after a chat delete | `runtime/mirrorReaperHost.ts` | an ST popup |
| Studio diagnostics | `studio/diagnostics.ts` | Studio only |
| **Coming in v2.7:** Summarize/vector privacy (02 C2), "the model does not think" (06), image backend and models (26), persona fit (30), vector conflicts (29), stale extension (01 "What's new") | each plan | each plan proposed its own row or alert |

Each one is right on its own. Together they mean a player can get a toast, a popup, a HUD chip, a settings row and a
Studio warning about one install, with no single answer to "is this story ready to play here?".

## Proposal: a check registry and one surface

### A. The registry (pure)

`src/runtime/checks/registry.ts`. One entry per check:

```ts
{ id, area,                       // plan 01 registry areas
  scope: "install" | "chat" | "story",
  audience: "player" | "author",
  severity: "blocks" | "degrades" | "info",
  applies(ctx): boolean,          // story-scoped checks run only when a story is active in this chat
  detect(ctx): Finding | null,    // pure over a host snapshot (no host calls inside)
  consequence: { player, author },// plain words, consequence first (Repair/diagnostics house style)
  action?: OneClickFix,           // e.g. add members, unmute, deselect a global book
  target?: ShowMe,                // revealSetting / open ST's own panel
  feature?: FeatureId }           // plan 01 registry link: features declare `needs`, needs map to checks
```

- **Host reads happen once per evaluation,** in a host-side snapshot builder (the `stHost` modules that exist today:
  capabilities, extension settings, connection profiles, persona, vectors, image backend), so every `detect` is pure and
  testable.
- **When it runs:**
  - on story select, hydrate and restart;
  - on `CHAT_CHANGED`, settings saves, extension toggles and connection changes;
  - on demand ("Re-check").
  - Never on the reply path.
- `runtime/repair.ts` becomes the **ordering** of the registry's `blocks` findings (worst first, the one step to do
  next). Its existing steps become checks, so there is one source and Repair keeps its contract.

### B. One surface: "Story setup"

- **Active only while a story plays in this chat.** Install-scoped checks also show on the settings panel's Start entry
  point, as the "Getting started" checklist (plan 01).
- **HUD.** One chip shows the count by severity, or nothing when all is well. It replaces today's separate
  needs-setup chip state.
- **Drawer.** A "Setup" section at the top of Overview, shown only when something is found:
  - each finding: consequence, then **Show me** and the one-click fix;
  - player mode shows `player` findings in player copy;
  - Author view adds the author findings and the detail.
- **"Before you start."** Plan 03's briefing modal and plan 30's persona step show `blocks` findings for this story
  first. A player sees, before the first message, that the story needs X and how to fix it.
- **No more popups or toasts for checks.** ST popups stay only for decisions that need an answer now (keep / restart,
  delete the mirror book). A check that used to toast now raises a finding.
- **Quiet by design.**
  - A finding the user dismisses ("I know, keep it") is remembered per install and per check, like
    `worldInfo.keptGlobal` today.
  - `info` findings never raise the HUD chip.

### C. What each v2.7 plan contributes

Each plan adds checks; none adds its own alert channel:
- 02 C2: Summarize/vectors privacy;
- 06: the model does not think;
- 26: no image backend, model missing, broker idle;
- 29: Vector Storage conflicts;
- 30: persona fit;
- 01: extension update, What's new (info).

The registry test fails a check without consequence copy (like `DIAGNOSTIC_CONSEQUENCES`) and a player-audience check
whose copy uses a jargon word (plan 01's list).

## Gates (tier 1, no LLM)

- **Pure:** every check's `detect` over fixture snapshots; the registry tests (consequence present, audience copy
  clean, ids unique); Repair ordering unchanged for its existing steps (regression).
- **UI:** Storybook for the HUD chip, drawer Setup section and "Before you start" with 0, 1 and many findings
  (a11y; 390/768/1440); `assert-player-clean` sweep.
- **Live:** a no-backend lane (no memory profile, Summarize on, no image backend). Expected: three findings in the
  right order, each Show me lands, each fix clears its finding, nothing toasts.
- `npm run gates`.

## Decisions for the user

1. One check registry, with Repair as its "next step" ordering? **Recommended: yes.**
2. Active only while a story plays in the chat (plus install checks in Getting started)? **Recommended: yes.**
3. No toasts or popups for checks; findings only? **Recommended: yes**, popups kept only for decisions.
4. Dismissible per check per install? **Recommended: yes**, except `blocks` findings, which stay until fixed.
5. Build position: right after plan 01 (it uses the registry areas and the plain-language rules), before 03/04/06/26/30
   land their checks. **Recommended: yes.** The plan 06 / 02 C2 build in progress is shaping its alert as the seed of
   this registry.

## Links

01 (registry, Getting started, jargon list), 02 C2, 03 briefing (Before you start), 06, 26, 29, 30.

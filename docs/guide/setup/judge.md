# Judge

The judge is a small, fast model that picks from lists: who speaks next, which lore entries matter, whether a memory
note is real, where and when a scene is. It runs behind the optional `story-orchestrator-judge` server plugin. The
default provider is TypeSafe's Jev (`jev-1.13.0`).

Without the plugin or without a key, every use quietly takes its usual path. The judge never blocks play and never
writes to the story itself.

## Install

1. Install the plugin (see [Server plugins](README.md#server-plugins)) and set `enableServerPlugins: true` in
   SillyTavern's `config.yaml`. Restart SillyTavern.
2. In **Author services → Judge — install-wide, optional**, paste your key into **TypeSafe API key** and press
   **Save key**. It is stored in SillyTavern's own secrets on the server; it is never shown again and never sent to
   the page.
3. **Use the judge** is on by default. The status line says whether the plugin answers.

The plugin reads the key from, in order: the requesting user's SillyTavern secrets; then, only when SillyTavern user
accounts are off, the `TYPESAFE_API_KEY` environment variable and `~/.typesafe/api-key/.env`.

## Privacy

A configured key is consent: while the judge is on, each use sends the chat excerpts it lists (below, and in each
use's tooltip in the panel under "Sends:") to the provider it is routed to. It never sends character cards, persona
text, other chats or the key. To stop it, untick **Use the judge**, or the single use. TypeSafe's policy:
<https://typesafe.ai/legal/privacy-policy>.

A local provider (`llama-logprob`, a llama-server you run, set with `SO_JUDGE_LLAMA_URL` on the server) keeps
everything on your machine. A use is sent to a provider only where it has been measured for that provider and model.

## Uses

Every use is on by default except **House rules**. The ones marked *author* show only in Author view.

| Use | What it does | Sends |
|---|---|---|
| Speaker direction | Picks who speaks next in a group chat when the scene has talk control. Needs a one-line role for every character in the pool. | the last 8 messages, character names and roles, the scene name and goal |
| Check memory before storing | Drops notes the story never showed and down-weights doubtful ones. | the read's messages, the candidate notes, story title and cast names |
| Merge related notes | Decides whether two similar notes are a duplicate, an update, or both true. | two memory notes per question |
| Notice scene changes | Asks for the scene read on the turn a scene changes. | the last 8 messages, the scene name and goal, cast names and roles, your persona name |
| Scene tracker | Keeps location, time and who is present, and adds them to the prompt. | as above, plus the story's locations |
| Heading toward | Shows which upcoming scenes play is moving toward (Author view). | the last 8 messages and the next scenes' names and goals |
| Lore selection | Adds the lore entries that matter to the next reply, even without their keywords. | the last 8 messages, the scene name and goal, each entry of the story's lore-select books |
| Curator focus | Shows the World Info curator only the entries the story may have overtaken. | the story so far and the story's lore entries |
| Every-turn story reads | Reads the qualities the author marked for it on every turn, so scenes open sooner. | the last 3 messages, the story title and scene, each marked quality's description and values |
| Stall check | Checks a stuck exit before spending a full re-read. | the messages since the scene began and the unmet conditions |
| Expansion review (*author*) | Reviews generated scenes instead of a second model call. | up to 40 established facts, the target scene, cast names, the tension trajectory, the generated scenes |
| Prepare ahead (*author*) | Writes generated scenes one step ahead, where play is heading. Needs Heading toward. | nothing beyond Heading toward and the expansion |
| Agency check (*author*, warden) | Asks whether a reply wrote what only you do, say or decide; if so the next prompt leaves your part to you. | the character reply, your latest message and your persona name |
| House rules (*author*, warden, **off**) | Checks a reply against the story's house rules. Below its measured floor, so off by default. | the character reply and the house rules |
| Lore check (*author*, warden) | Checks a reply against the story's own lore entries that fired for it. Needs the continuity warden on. | the reply and up to 8 fired story lore entries (600 characters each) |
| Exclusive lore selection (*author*) | For a story marked exclusive, switches off for one reply the lore-select entries the judge did not pick. Needs Lore selection and per-chat lore gating. | nothing beyond Lore selection |
| Sprite expressions | Picks who each passage of a reply is about and their expression, for the sprite stage. | each reply's passages, on-stage names, expression labels |

### How the defaults were chosen

Every use was measured in English on 2026-10-01 against `jev-1.13.0`, each against a floor fixed before the run.
Every use met its floor except House rules, which stays off: on the Adolion saga's 8 rules it caught every broken
rule (18/18) and kept every kept one (10/10), but left untouched replies alone 165 of 172 times against a floor of
0.966 (2026-10-02). If you turn it on, prefer objective rules with one demand each; judgement rules that overlap (who
voices whom, mystery vs secret) raise false alarms. A paragraph-count rule is checked in code instead. On any other
model, or after the measurement set changes, the panel marks a use as unproven.

Notes per use:

- Speaker direction runs only when every candidate has an authored `roster[].role`; otherwise the usual director
  decides.
- Lore selection ranks by a compressed probability, so which entries win the top slots is weaker than its hit rate
  suggests.
- Curator focus pays off once the curator's scope passes about 40 entries.
- Every-turn story reads does nothing until the story marks qualities with `read_as`.
- The warden uses are best in `review` mode. Lore check's live latency and over-steer are not measured yet.

The warden uses run after a reply and only put a note in the *next* reply's prompt; review mode lets the author
approve each note first.

Two uses run before a reply (Speaker direction and Lore selection). They have a 1.5 s budget; a slow judge delays the
turn by at most that much before falling back.

## Server limits

The plugin never sends a request too large for the provider (it answers "too large" instead) and paces calls to the
provider's documented rate, halving its rate after a "too many requests" answer and recovering over two minutes.
Environment variables on the server: `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `SO_JUDGE_LLAMA_URL`,
`SO_JUDGE_LLAMA_KEY`, `SO_JUDGE_RATE_PER_MIN`, `SO_JUDGE_ACCOUNT_RATE_PER_MIN`, `SO_JUDGE_ACCOUNT_TOKENS_PER_SEC`,
`SO_JUDGE_MAX_IN_FLIGHT`. Details: `server-plugin/story-orchestrator-judge/README.md`.

---

[Setup](README.md)

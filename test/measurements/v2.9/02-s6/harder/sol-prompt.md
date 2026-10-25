# Task: write a harder card set for measurement S6 (roster voice prevention)

You are writing frozen test material for a SillyTavern extension ("Story Orchestrator"). The repo is public: everything you
write is synthetic and original (invented setting and names; no existing franchise, book, game or campaign).

## The feature under test

Each roster member can carry an authored delivery sheet `roster[].polish`. When the feature is on, the drafted member's own
private prompt block gets one line built from it, roughly:
`How you speak (wording only; it never changes what you know, want or do): <notes>. Rhythm: <rhythm>. Words that are yours: <prefer...>. Say it your own way instead of: <avoid...>.`
Nothing else changes. Replies come from a local 31B role-play model (thinking on).

Sheet schema and caps (validation refuses past a cap):
- `notes` <= 300 chars: register, sentence habits, what they never say aloud.
- `prefer` <= 12 items x <= 40 chars: words and turns of phrase that are theirs.
- `avoid` <= 20 x <= 40: words they would not use. Must not overlap `prefer` (case-folded); must not equal a member name.
- `tics` <= 12 x <= 40: model habits watched in their replies (e.g. "smirks"). Must not equal a member name.
- `rhythm`: one of "clipped" | "plain" | "flowing" | "ornate".
- The rendered line must stay <= 120 tokens (chars/4) per member: keep notes <= 220 chars, prefer 2-4 items, avoid 2-4, tics 1-2.

## The measurement (floors are frozen; do not discuss changing them)

60 replies per arm (20 narrator situations x 3 self-voiced members), arm baseline = feature off, arm prevention = feature on.
A blind rater (names replaced with [name]) is shown each member's `notes` and picks the speaker or "unclear" (unclear = wrong).
Floor: attribution gain >= 10 percentage points (prevention minus baseline). Also: targeted repetition (tic + avoid hits per
reply) down >= 25 %, guidance <= 120 tokens.

The current set scored 60/60 in BOTH arms: gain 0 at the ceiling. Its three cards (a nervous young adventurer searching for
his brother, a gruff old guild master who tells stories from his youth, a teasing guild partner) already differ in role, age,
backstory and content hooks, and its notes leaned on content ("ties things back to finding his brother", "a story from his
younger days"), so the rater could attribute by WHAT each said, with or without the sheet. That set cannot show a gain.

## What to write

A harder set where the ONLY systematic difference between the three members is how they word things, which only the sheet
carries. Requirements:
1. Three member cards that are near-interchangeable: same role (peers doing the same job in the same place), same age bracket,
   same pronouns (pick one set for all three), same standing, no personal backstory hook, no goal unique to one of them. Card
   fields: `name`, `description` (<= 500 chars), `personality` (<= 200 chars), `scenario` (<= 300 chars, the same for all three),
   `first_mes` (<= 300 chars, same neutral register for all three), `mes_example` (empty string ""). The cards must carry NO
   speech-style cue (no "speaks softly", "curt", "talkative", no catchphrases). Their descriptions may differ only in neutral,
   voice-free detail (appearance, a harmless habit with the hands, a favourite tool) so they are not literally identical.
   Names: plain, invented, two syllables, clearly different first letters, no word that is also a common English word.
2. Three sheets that make the voices strongly distinct in delivery only: different rhythm each (use three of the four values),
   different register (e.g. formal vs blunt vs warm-chatty), different sentence shapes. `notes` must be purely about delivery:
   no backstory, no goals, no topics they bring up, no opinions, nothing a rater could match by content. `prefer` items are
   wording (discourse markers, turns of phrase), not topics. `avoid` lists words the model tends to put in everyone's mouth in
   this register. `tics` are generic model habits (gestures, stock phrases) the model tends to overuse.
3. One narrator situation list: exactly 20 short situations (1-2 sentences each, <= 220 chars), set in the shared workplace,
   each inviting every member to react in speech, none favouring one member (no situation addresses a member by name or
   touches one member's card detail). Vary them: arrivals, small mishaps, decisions, news, weather, a visitor, a deadline.
4. A short public story frame: the shared place (one sentence), the checkpoint objective (one sentence).
5. `harder_because`: 3-6 bullet strings stating, before any inference, exactly what makes this set harder than the current one
   and what result it predicts for each arm if the feature works (and if it does not).

## Output

Exactly one JSON object, nothing else (no markdown fence, no commentary):
`{"setting": "<one sentence>", "objective": "<one sentence>", "pronouns": "<he/him|she/her|they/them>",
  "members": [{"id": "<lowercase name>", "card": {name, description, personality, scenario, first_mes, mes_example}, "sheet": {notes, prefer, avoid, tics, rhythm}} x3],
  "situations": [20 strings], "harder_because": [strings]}`

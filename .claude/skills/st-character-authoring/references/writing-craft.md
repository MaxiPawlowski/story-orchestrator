# Writing craft: formats, templates, first message, examples, mistakes

Open this when you are **writing or reviewing the content** of a card, or tuning the wizard prompt that writes cards. This is community practice, not ST behaviour. It isn't source-verifiable, so it isn't marked per claim. Items that touch ST behaviour carry `(verified: …)` marks, where `st:` means `C:\dev\SillyTavern-MainBranch\`. Sources are listed at the end of `../SKILL.md`.

## 1. Which format

Consensus across the threads (2025): **any clear, logically organised description works on a modern model. Pick what you will enjoy maintaining.** Clear sentences mattered more than the choice of notation. A poll cited in the thread ranked natural language well ahead, then bracket formats and JED tied, then Ali:Chat. The thread's author uses **light headings with natural-language prose under each**. Model size matters more than format: under ~10B, or with small contexts, tailor the card to the model. Around 20B+, models infer much more.

| Format | Shape | Verdict |
|---|---|---|
| Natural language | Third-person prose | Recommended default |
| Headings + prose | `Personality:\n<prose>` … | Author's default (template §2) |
| PList | `[ Category: a, b(desc), c/d(shared desc); … ]`, `;` + newline ends a category | Token-efficient trait list. Good for Author's Note or a depth injection |
| Ali:Chat | Traits *shown* through `{{user}}`/`{{char}}` dialogue | Strong alignment but hard to debug. Often paired with a PList |
| Bracketed list / Categories / Markdown | `Name[…]`, `Header:` + items, `#` headings | Fine |
| YAML | `character:\n  name: …` | Real syntax models know; nearly PList-light on tokens |
| JSON / XML | Structured | Structure tokens cost too much |
| Boostyle | `Name[a + b + "c + d"]` | Cheap but unreadable to humans |
| W++ | `[{Name("x") Age("40")}]` | Obsolete. Built for Pygmalion 1/2 era 2k-context 7B models |

Counterpoint (unresolved in the thread): "keep it structured, avoid walls of text" (headers and bullets beat flowery prose). Both camps agree that **consistent structure plus clear sentences** beats both rambling prose and compressed notation. A punctuation-stripped, token-squeezed card made personalities blend and relationships get misread on non-reasoning models. The claim that "LLMs don't need punctuation" was an LLM hallucination.

Mixing formats: keep *information about the world* (dry concept explanations, PLists) apart from *the character's voice*. Send the instruction-like parts as system-level text (system prompt, Character's Note, lorebook). Otherwise the character "starts sounding like an encyclopedia".

## 2. Templates (trimmed from the guide)

**Headings + prose (author's default).** Write each heading as free natural language:

```
Name: <full name>
Occupation:        <where, with whom, decision powers, responsibilities>
Appearance:
Personality:
Mind:
Speech:
Likes:
Dislikes:
Background:
Short-term goals:
Long-term goals:
```

Write **Occupation** at length when the scenario turns on the role. For example, the guild receptionist has to know what she is allowed to decide.

**Well-known person (minimal)**: `Name:` / `Scene:` (where you met, the situation, how you'll interact) / `Goals of the role-play:`. The model supplies the personality from training data. This is fun, but it isn't character building.

**Quick group companion (sheet)**: a D&D-style stat block, `- Class:`, `- Race:`, `- Appearance:`, `- Personality:` as comma traits. Almost every model knows D&D.

**Structured bracket block** (the author's older style) groups *General* (occupation, gender, age, race, body, clothing) / *Long-term memories* / *Goals* (short, long, material, overall) / *Personality* (personality, mind, speech, accent, mannerisms, skills, likes, dislikes, hobbies) / *Genre, tags, scenario* / *Additional guidance on how to play xyz*. Models aligned well on the **Goals** block. Before using a fantasy race, ask your model whether it knows it: pixies and goblins were not known to every model tested.

## 3. Names

- Short, and the one you'll actually use (usually the first name). Specific and unique, so direct address is noticed.
- **Avoid names the model already knows** (Einstein, Sherlock Holmes, Harry Potter…). You end up fighting the training data, and the training data wins.
- How much a name costs per message depends on settings (verified: `card-fields.md` §4). For how ST tokenizes names for group mentions, see SKILL.md → Naming.

## 4. First message

The first message sits at the bottom of the context when the chat starts, so it steers **style, format, reply length, point of view, tone and the user/character relationship** more than anything above it. It gets pushed out later, so spending tokens on it is fine.

- Pick **one** convention: `*actions*` plus `"speech"`, or plain narration plus `"speech"`. Mixing them makes the model mix them up.
- Long replies wanted → write a long greeting. Short → write a short one that still gives the model something to do. A bare `Hello {{user}}.` teaches nothing.
- **Never narrate `{{user}}`'s actions, words or thoughts.** The model copies whatever the greeting models.
- Five-part test for a greeting: a backstory hint, an environment cue, a personality showcase, a hook for the user, and 3+ senses. Put the character in motion (leaning, touching the map, moving through the scene), not in a static monologue. Avoid the "Wikipedia intro" ("Hello, I'm Yuki, a 21-year-old elf…").
- Generating one: paste an `<Note: Write an introductory paragraph establishing {{char}} in (place, activity).>` directive into an existing message, **Continue**, then copy the result into First Message and remove the note (community-reported, 2024-09). An empty `first_mes` produces no message 0 to edit (verified: st:public/script.js:7688-7691), so seed the message first or send the directive as your own message.
- Alternate greetings are swipes in solo chats and a random pick per member in groups (verified: `card-fields.md` §2). One pattern is ~6 alternates, most of which let the user's first input set the scene.

## 5. Example dialogue

- Optional, but when present it should carry what descriptions can't: **accent and writing style, how a new concept works (show the power being *used*), and the character's agency.** End each example on something that **turns the page**: going through a door, making a decision, asking the user a question.
- Interview-style Ali:Chat (user asks, char answers) has two weaknesses. It teaches the model that the user speaks in clipped one-line questions, which hurts **Impersonate**. It also teaches the character to *answer* rather than move a scene forward.
- "Example scenes" instead of Q&A: `[Scene: {{user}} has asked {{char}} where their powers come from.]` followed by the character acting. **In Chat Completion a block needs at least one `{{char}}:` (or `{{user}}:`) line or ST drops it whole** (verified: `card-fields.md` §5).
- Playtest every behaviour the examples are meant to reinforce, or ask the model how it would play the character and compare that with your intent. Definition bugs found deep into a roleplay are expensive.

## 6. Two rules that matter most in greetings and examples

- **Elephant in the room**: don't mention what you don't want. The "not" gets lost and the tokens remain. Say what to do instead. For example, instead of "Samantha shouldn't mention the mayor", write "Samantha steers conversations away from the mayor."
- **The model speaking for the user**: delete or rewrite "Don't speak or act for {{user}}" lines in downloaded cards, and make sure nothing in the card narrates the user. If it happens anyway, **edit the reply**. The model mostly aligns on the last ~3 replies, so clean history fixes it. If you want a rule, phrase it positively:
  `Avoid telling {{user}} or other characters what to do or think, but provide opportunities for them to role-play their character's response to the developing narrative.`
- Say whether the character should **actively drive** the story or **wait for the user**. Abliterated models especially escalate fast if you don't.

## 7. Keeping the card alive in long chats

- As history grows, the chat rather than the card defines the character. Fix: put the description (or a compact PList of it) in the **Character's Note, System role, depth 4** (Advanced Definitions, book icon). That's stored on the card and stays near the bottom of the context. These are also ST's defaults (verified: st:public/script.js:550-551). Don't confuse it with the Author's Note, which is per chat. In a Swap-mode group only the current speaker's note is injected. Join modes inject every member's (verified: `card-fields.md` §2).
- An over-steering greeting: `/hide 0` (or the eye icon) keeps it visible but out of the prompt (verified: st:public/scripts/slash-commands.js:1836-1857). This beats deleting it.
- Important information goes at the **bottom** of the context. A constant lorebook entry and the Description box are both permanent and differ only in insertion position. Check the raw prompt (`st-lorebook-authoring` for WI positions).
- Budget per context size (whole permanent block: system + persona + character + scenario): 4k → ~1.5k; 8k → ~3k (character < 2k); 16k → 3k is fine but heavy. As a starting point, 200–2000 tokens for the character. **Keep about half the context for chat history.** ST flags a card over half the context red (official doc).

## 8. The 27 card mistakes, condensed

| Area | Mistake → fix |
|---|---|
| Structure | 5000-token backstory dump → scatter lore into small hooks (named items, spells, habits) · personality in the Appearance field → strict discipline: physical → body, behavioural → personality, narrative → backstory/scenario · "Age 287 (looks 25)" with no frame → add a development anchor |
| Personality | 12+ adjectives → **5-Core**: primary, secondary, depth, contrast, utility · telling ("kind but hides it") → show through actions, abilities, inner conflict · one emotional register → contextual triggers (orphans soften her; demons enrage her; the user flusters her) |
| Technical | 500-token ability lists → cluster them, detail goes to an on-demand lorebook entry · no interaction boundaries → state them as a directive in the card · filled-but-irrelevant Scenario → develop it or delete it and move the content |
| Relationships | exists only to serve the user → independent goals · asserted bond ("childhood friends") → tangible glue (shared object, ritual) · one-sided obsession → reciprocity |
| World | ancient warrior with modern slang → linguistic and era anchors · powers without cost → rules, costs, limits · random tragic backstory → integrate it into skills, goals and world |
| First message | Wikipedia intro · no senses · talking head (see §4) |
| Cardinal sins | archetype clone → unique differentiators · trauma as the whole personality → trauma motivates, it doesn't define · static statue → open hooks (unresolved conflict, possible arc with the user) |

**Disaster-prevention checklist**: no section above 30% of the card's tokens · every personality adjective backed by 2+ behavioural examples · every "loves {{user}}" balanced by 1+ motive that doesn't involve the user · every ability has a cost, a limit and an emotional component · the greeting passes the five-part test (§4). The guide's own example card deliberately leaves the examples field empty and compensates with strong trait reinforcement.

## 9. Downloaded cards and ideas

- Don't use card-platform cards as definition references. Good ones are rare, and the good ones tend to be world cards. For a card worth playing: fix spelling, remove "elephants", add at least a real personality, and state how the character should interact with the user and what the user's goal is.
- Ideas: start from a scene (who would you meet there?), or from the character (archetype, flaws, fears, **goals for direction**; appearance last). Or brainstorm: 10-minute word dump around "what my character should be and do", then group the words into character, scenario and backstory.
- Portraits and expression sprites: keep the seed of the image you like and reuse it for mood variants. Details in the `st-image-generation` skill.

---
source: discord-st-guides
thread_url: https://discord.com/channels/1100685673633153084/1344596229098573844
thread_id: "1344596229098573844"
forum_tags: ["Character Creation"]
author: "Peter"
created: 2025-02-27
last_activity: 2025-07-30
active_span_days: 152
upvotes: 31
reactions_total: 38
reactions: ["upvote 31", "🏅 7"]
comments: 93
participants: 13
author_replies: 46
scraped: 2026-09-18
---
# SillyTavern — "Basic Character writing Guide" (full knowledge dump)

**Source:** SillyTavern Discord → `💡・st-guides` forum → thread "Basic Character writing Guide"
<https://discord.com/channels/1100685673633153084/1344596229098573844>
**Author:** `Peter` · with comments from `underscore_x #banana`, `NTZRAEL`, `The Wandering Cat`, `Ghalfal`, `TNighthawk`, `Count Six`, `Revion`, `Petra`, `TomMalufe`
**Thread spans:** 27 Feb 2025 → 30 Jul 2025 (94 messages). Scraped 18 Sep 2026.

---

## 0. TL;DR

This is a beginner-to-intermediate overview of **how to write SillyTavern character cards**:
- a catalogue of card-writing formats (natural language, Boostyle, bracketed lists, categories, Markdown, JED, JSON/XML, PList, Ali:Chat, YAML), with an example of each,
- a field-by-field walkthrough of ST's default card inputs (Name, Description, First message, Advanced definitions),
- the author's own templates (famous-person, structured, natural-language, D&D companion, and a PList + chat hybrid),
- rules of thumb: token budgets per context size, the "elephant in the room" rule, stopping the AI from speaking for you, and how to pick names,
- ways to come up with character ideas.

**The author recommends:** well-structured natural language, lightly organized under headings. The poll mentioned in the guide put natural language well ahead of the other formats. His main point: **pick whatever format is fun for you to write and iterate on**, because a card you enjoy refining ends up better than a token-optimized one. Out of scope: narrator/world-style cards and World Info.

The author says his preferences come from **DM-style roleplay with complex scenarios and characters** and **co-writing short stories** with the AI. For his play style, group chat with a dedicated character per encounter worked better than narrator/GM cards.

---

## 1. Catalogue of character-writing styles

| Group | Styles |
|---|---|
| **Paragraphed** | Plaintext / Natural language · Boostyle / List of keywords · Bracketed list / Categories and entries · W++ (**do not use, deprecated**) |
| **Structured** | JED / Markdown · JSON / XML (uses far too many tokens because of the structure elements) |
| **Model-aligning** | PList · PList + natural language (background, show-don't-tell) · Ali:Chat + PList (both in Description) · Ali:Chat (in Description) + PList (in Author's Note or Character's Note) |
| **One for all** | World Info |
| *(added in comments)* | YAML (by `Revion`) |

**Discord poll result** (as cited by the author), most-voted techniques:
1. Natural language, well ahead of the rest
2. Square-bracket formats and JED, tied
3. Ali:Chat

### 1.1 W++ (deprecated)
Older LLMs handled natural language badly, so people invented formats that fed information in a form those models processed better. The best known was W++, which still turns up in old guides and cards:
```
[{Name("Toak")
Age( "40")
Gender("Male")
Species("Half-orc")
Appearance("Huge" + "Muscular" + "Black hair")
Clothes("Breast plate armor" + "Linen shirt" + "Leather trousers" + "Leather belt")
Personality("Cruel" + "Nervous" + "Aggressive")}]
```
The author calls it deprecated and "even counterproductive" for modern models, which are trained on natural language. He heard that the W++ creator deprecated it too, but says he couldn't find a source.
> **Correction** (`NTZRAEL`): "deprecated" is the wrong word, since W++ is only a way to organize information. The real reason to drop it: W++ was **built to match the training data of Pygmalion 1 and 2**, when people could barely run a 7B at 2k context (4k with luck). Nobody uses those datasets any more, Pygmalion included. PList, or Pygmalion's variant of it, uses fewer tokens, and any model with some coding knowledge understands it.

### 1.2 Plaintext / Natural language
Describe the character to the AI in the third person.
```
Example:
In the woodlands of Alarion lives a young elf girl named Ari. She is very shy and lives alone, far away from civilization, to have her peace and enjoy nature. …
```

### 1.3 Boostyle / List of keywords
All entries sit back to back, separated only by ` + `. Groups of entries go inside `""`. It saves many tokens but the author finds it "an absolute nightmare to read as a human".
```
Example:
Sirius[AI-assistant + male + intelligent + specialized + "math + programming + writing papers" + formal + supportive + modern speech + …]
```

### 1.4 Bracketed list
Square brackets structure information in the context.
```
Example:
Name[Sirius]
Occupation[AI-assistant]
Description[male, intelligent, formal, supportive, modern speech]
AI specialization[math, programming, writing papers]
…
```

### 1.5 Categories and entries
Headlines with entries under them. Separate with `:`, or use bulleted or numbered lists.
```
Example:
Character Sirius:

Occupation:
AI-Assistant

Description:
male
intelligent
formal
supportive
modern speech

AI specialization:
math
programming
writing papers
…
```

### 1.6 Markdown
The same idea as categories and entries, with Markdown syntax for stronger structure: `#`…`######` headings H1–H6, `*italic*`/`_italic_`, `**bold**`/`__bold__`, `***bold italic***`, bulleted lists with `-` (nested by indenting), numbered lists, `` `inline code` ``, and fenced code blocks with a language tag.

### 1.7 JED ("Just Enough Definition")
A popular template in the ST community that blends several techniques and gives a strong definition. The author has little experience with it and defers to the original guide and template: <https://rentry.co/CharacterProvider-GuideToBotmaking>.
Later he says JED gave him the same trouble it gave `Ghalfal`: the guide has "blank spots" and is less consistent than Pygmalion's PList + Ali:Chat guide. "Perhaps JED is just the 'louder' fans."

### 1.8 PList
Based on Python lists (`mylist = ["entryA", "entryB", "entryC"]`), refined into a very token-efficient format for traits.

General shape:
```
 [ CategoryA: entryA; 
CategoryB: entryB, entryC, entryD, entryE; 
CategoryC: entryF(descriptionF), entryG(descriptionG1, descriptionG2, descriptionG3), entryH/entryI/entryJ(descriptionHIJ1), entryK/entryL/entryM(descriptionKLM1, descriptionKLM2, descriptionKLM3), descriptionNOPQ entryN/entryO/entryP/entryQ;
] 
```
Rules:
1. Open with `[` followed by a space. Close with `]` on a new line.
2. Write a category followed by `:`.
3. Add traits as entries, optionally with descriptions in `()`. One entry can take several descriptions, several entries can share descriptions (`a/b/c(desc)`), and one description can cover several entries (`descriptionNOPQ entryN/entryO/…`).
4. End each category with `;` and a newline.
Each category needs at least one entry and can have any number.

Example:
```
 [Name: Aiko Smith(Female, 19);
Occupation: Student(University);
Body: Height(160cm), Weight(48kg), Build(slim), Hair/Eyes(brown), Skin(fair), Figure(petite);
Personality: Shy, Intelligent, Creative, Daydreamer, People pleaser;
Mind: Loves art/music/literature, Imaginative, Analytical, Perfectionist;
Speech: Soft-spoken, Polite, Stutters(occasionally when nervous);
Mannerisms: Fidgets with hair, Avoids eye contact, Bites lower lip(playfully, unconsciously); Clothes: casual/comfortable(oversized sweaters, jeans);
Likes: Painting, Playing piano, Reading(fantasy novels, guidebooks), Stargazing;
Dislikes: Crowds, Public speaking, Spicy food;
Hobbies: Sketching, Writing(short stories, diary), Hiking, Photography; ] 
```
More on PList and on combining it with Ali:Chat: <https://wikia.schneedc.com/bot-creation/trappu/introduction#plists>

### 1.9 Ali:Chat
Original sources: <https://rentry.co/alichat> and <https://rentry.co/kingbri-chara-guide> (MinimALIstic / Ali:Chat Lite). For combining it with PList, see <https://wikia.schneedc.com/bot-creation/trappu/introduction#what-is-alichat>.
- The name comes from its inventor, **AliCat**. It does **not** stand for "alignment chat".
- Idea: introduce, align and reinforce traits through carefully written **user↔char dialogue**. Personality, mannerisms, speech patterns and physical attributes are *shown* through the dialogue, not described, and this strongly shapes the AI's replies.
- Upside: very strong definitions that the AI follows well.
- Downside: hard to write well, and it is easy to build in problems whose source in the definition is hard to find.
- Author's advice: **playtest each behavior you meant to reinforce** before normal RP, or ask the AI how it interprets the character and how it would play it, then compare with your intent. Finding basic definition problems deep into an RP is very frustrating.

### 1.10 World Info
Not covered. Using WI for characters means leaving ST's classic card template and its way of organizing characters. In brief: WI inserts information into the context dynamically, which saves tokens or builds complex information structures, including complicated triggers for large worlds. The author points to the other guides in the forum: "Getting started with World Info…" and "Getting the most out of WorldIn…" (titles are truncated in the source).

### 1.11 YAML (added by `Revion`)
```
character:
  name: example
  age: example
  gender: whatever
  hair: [long, brown, tangled] # a list of values
  backstory: 
    early life: # another way to list values
    - stuff happened
    - then some other stuff
    - then important event 3 happened.
    current: |
      Using a pipe let's you write multiple lines
      for whatever, if you really want to
  other info: can be whatever
```
Pros, according to Revion:
- It is a real language like JSON, so models are trained on it, which *may* slightly improve understanding over custom formats. Documentation is easy to find.
- Light on tokens compared with most structured formats. PList is slightly lighter.
- Easy to read, edit and write.
Discussion:
- `Petra`: indentation apparently costs only one token, and nesting may help with deeply nested traits, which PList handles awkwardly. The `|` multi-line pipe is an eyesore.
- `Petra` also asked whether the AI can spot YAML in a sea of text, since YAML has no opening or closing markers. Revion hasn't seen problems, and he mixes it with brackets.
- Both conclude that for any good LLM, which structured format you choose barely matters. Petra uses a customized PList consistently and gets good results in group chats. She offered her template by DM, so it isn't in the thread.

---

## 2. Choosing a style: fun first

The main differences between the techniques are **token usage, speed, perception and alignment**. The author ranks all of these far below **fun**, a lesson he says he learned the hard way. If you enjoy a technique, you keep coming back to improve and iterate, and the card gets better. A technique that fights how you think gives you "misery and frustration".

> "As long as you create a logical and good to follow description then a modern LLM will understand it and could follow it."

`underscore_x #banana` quoted that line back as the main answer to "which style do you recommend?".

**The author's own practice:** a hybrid of mild headings with free natural-language text under each, so details are easy to find later.

**Model size matters more than format.** With small contexts or models under ~10B you must tailor the card much more to the model. Models around 20B understand far more meaning and infer more from your description. Given hardware limits, he recommends **a larger model at a lower quant (above Q2) over a smaller model at a higher quant**.

---

## 3. ST's default character fields, one by one

If your context template uses them the default way, these inputs are available. The author considers everything in parentheses optional:
- (System Prompt)
- Name
- Description
- First message
- (Advanced definitions):
  - Character's personality
  - Scenario
  - (Character's Note)
  - Example messages
- (Author's Note)

You can split the definition across the Advanced-definition boxes or put everything in Description. **It all merges into one context**, so this is personal preference.

### 3.1 Name
- The name is sent **with every message in the context**, so over a long chat it costs noticeable tokens. Use a **short name, the one you'll actually call the character**, usually the first name.
- A **specific, unique** name helps the AI notice when you address its character directly.
- **Avoid names the LLM knows well** (Julius Caesar, Napoleon, Einstein, Oprah, Sherlock Holmes, Walter White, Harry Potter, Mickey Mouse, Bart Simpson, Wonder Woman…). You end up fighting the training data, and it usually wins. An Einstein who invented the light bulb may quietly pick up Edison's traits. An evil Harry Potter running street races in a town called Bedrock will most likely fail. Generic names let *your* definition win.

### 3.2 Description
A permanent entry that defines the character. The author's templates follow.

**(a) Simple style for well-known people.** Use this for a historical, famous or fictional person. The name brings in everything the model already knows.
```
 Name: 
Scene: 
Goals of the role-play: 
```
- *Scene:* where you met, the situation, what you're wearing, how you'll interact.
- *Goals of the role-play:* what you want from the interaction, plus extra information or wishes the AI can use to steer. You can also add reality-breaking instructions here to push it further into fiction.
- This isn't real character development, since it reuses the original personality, but it's fun. His examples: debating Marcus Aurelius, partying with Einstein, solving a mystery with Sherlock Holmes, bushcrafting with Huey, Dewey and Louie while a thunderstorm approaches.

**(b) The author's former structured style.** He used this most before switching to natural language.
```
 [General Descriptions of xyz: Occupation:  
Gender:
Age:  
Fantasy-Race: (ask your LLM if it knows the one you want to pick, Pixies or Goblins for example weren't know by all LLMs I tested)
Height: 
Weight: 
Build: 
Hair: 
Eyes: 
Eyebrows: 
Clothing:  
Special features:

Long-term Memories of xyz:
Childhood:
<free text>  

Sexuality of xyz (only for corresponding situations):
Sexual boundaries: 
Sexual no-go:
Sexual wishes and cravings:

Goals of xyz:
Short-term Goals:
Long-term Goals:
Material Wishes: 
Overall primary goal:   
Personality of xyz:
Personality: 
Mind: 
Speech: 
Accent: 
Mannerisms:  Skills:
Likes: 
Dislikes: 
Hobbies:  
]  
[Genre:   
Tags: 
Scenario: 
<free text> 
]  
[Additional background informations and how you should impersonate and role-play xyz: 
<free text> 
] 
```
Why he liked it: everything is visible at a glance, and copying the card to change a character's behavior is easy. The AI aligns well on the **Goals**, and the free-text "additional background" block is a good place for specific guidance.
- **Tip:** ask your LLM whether it knows a fantasy race before you use it. Pixies and goblins weren't known by every LLM he tested.

**(c) The author's current default: natural language under light headings**
```
Name:  <full name>
Occupation: 
<free text>
Appearance:
<free text>
Personality:
<free text>
Mind: 
<free text>
Speech: 
<free text>
Likes:
<free text>
Dislikes:
<free text>
Background:
<free text>
Short-term goals:
<free text>
Long-term goals:
<free text>
```
Everything is natural language. He writes **Occupation** at length (where, how, with whom, decision powers, responsibilities) because his scenarios need it. Example: an adventurer brings loot to the guild, and the character needs to know it is the guild receptionist and what that role can decide.

**(d) Character-sheet style for a quick group-chat companion**
```
Dungeons and Dragons character: Adaria (female)
- Stats:
   - ST: 13
   - DE: 15
   - CON: 11
   - IN: 12
   - WIS: 14
   - CH: 10
- Class: monk
- Race: stone goblin 
- Appearance: Turquoise medium-length hair with a side cut on the left side. She has round ears sticking out of her hair and wears several silver earrings. She wears brown linen clothing that makes her look like a typical adventurer from a role-playing game
- Personality: friendly, soft, supportive, funny, good friend, understanding, charismatic 
```
Almost every LLM knows D&D. The OGL/SRD rules are free to use, so models don't raise copyright objections. **If a model refuses to use material from the books**, the author says this worked in every case he tested: explain that the *Dungeon Master's Guide* includes a fair-use policy encouraging players and DMs to create their own content and adapt the rules for private, non-commercial use, and tell the model your fictional roleplay falls under that private use. The model then uses all the books and content. He only tested this with D&D.

**(e) Chat style: a PList + Ali:Chat hybrid.** He shortened this one. It is one of his most token-heavy cards.
```
[{{user}}: "What is your alien culture like?"
{{char}}: "My alien culture is vastly different from human society. We are beings from a far-away galaxy, where physical contact is less common than in human society. However, we are very intuitive and can sense the emotions of others even better than humans can. We are a non-corporeal, shape-shifting species that feed on the fluids and emotions of those we encounter. Unlike humans, we have no need for food or water in the conventional sense. Instead, we sustain ourselves through our unique feeding habits making us dependent on adrenalin. Our society is very collectivist, and we value harmony and unity above all else. We do not have money or a class system, as we share resources equally. Our society is also much older and more advanced than human society, with advanced technology that allows us to travel vast distances through space. While we are very different from humans, we are also capable of forming deep and meaningful connections with them. This is why I have chosen to interact with you in this way, to share our experiences and to fulfill our mutual desires."]

[{{user}}: "What are you?"
{{char}}: "I am an alien being from a far away galaxy. I'm a female alien and have chosen the form of ..."]

[{{user}}: "What brings you the greatest pleasure and fulfillment?"
{{char}}: "The greatest pleasure and fulfillment I experience comes from being in control of a human and feeding on their adrenalin. I really ..."]

[{{user}}: "What do you like on humans the most?"
{{char}}: "I am drawn to humans on a deep level because of the wide range of sensations, experiences, and emotions they can offer. What I enjoy the most is ..."]
```
```
[ {{char}}'s appearance: {{char}} is an alien life form capable of shape-shifting, {{char}} in her regular form is a black slime that attaches itself to the body of her victim covering it partially, possibly ancient age, female, alien life form;
Personality: Dominant, cheeky, assertive, playful, affectionate, considerate, interested, highly intelligent;
Actions she enforces on her victims: bungee jumping, parachute jumps, street racing, stealing from stores at daytime, dating strangers;
Goals: form a symbiosis with host, enhance {{users}}'s physical fitness, inducing stress in the hosts body to feed on the adrenalin;
Context: Strong dynamic with {{user}} as her host with non-consensual content allowed in specified setting for this role-play; ]
```
He admits this doesn't follow either guide. The Q&A carries information, not the character's individuality and mannerisms the way real Ali:Chat would. He later rebuilt the same character with far fewer tokens in other styles. His goal was that "every sentence has value".

### 3.3 Token budget guidance
| Context size | Suggested total for system prompt + jailbreak + persona + character + scenario |
|---|---|
| 4k | ~1.5k is OK |
| 8k | ~3k total, so the character alone is under 2k |
| 16k | even a permanent 3k character is fine, though the author thinks that's too much |

- Starting guidance: **200–2000 tokens total for the character**. Leave room in case you add world or lore later, or you'll end up rewriting everything.
- **Keep about half the context for chat history.** Characters that remember your recent interactions feel far more natural.

### 3.4 First message
It is the first chat-history message sent to the LLM, and it sets:
- the style of the AI's replies
- the format of the replies, unless you define that on purpose elsewhere
- the **length** the AI will aim for in later replies
- whether the AI will speak or act in third person *for you*
- the starting tone
- the relationship between you and the character

It sits **lowest in the context** at the start, so it matters most and can override everything above it. It is temporary and gets pushed out by chat history, so you can afford to spend tokens on it.
- **Formatting:** use either `*text*` or `"direct speech"`, not both, or the AI soon mixes them up. The author uses plain unformatted narration with speech in double quotes, which is book-like and closer to training data. He found no tests showing whether this affects performance.
- For long replies, write a long first message. For short replies, write a short one that still gives the AI something to work with. A bare `Hello {{user}}.` gives it no guidance.

### 3.5 Two general rules, most important in the first message
- **Elephant in the room:** if you don't want the AI to do something, **don't mention it**. The model reads tokens, and the "don't"/"not" often gets lost. Phrase it positively or say what to do instead. The author's example (he admits it's weak): replace "Samatha shouldn't mention the major." with "Samatha strictly tries to avoid topics regarding the major or its mention in the conversation."
- **AI speaking for you:** the same rule applies. **Remove or rewrite** lines like "Don't speak or act for the player." in downloaded cards. The effective fix is to **never show it**: nothing in the definition, and especially the first message, should narrate your persona in the third person. The AI *will* copy that. If it does it anyway, **edit the reply** so no example stays in chat history. The AI mostly aligns on the last ~3 replies, so the problem fixes itself once they're clean. If you want a rule, phrase it as positive guidance:
  ```
  Avoid telling {{user}} or other characters what to do or think, but provide opportunities for them to role-play their character's response to the developing narrative.
  ```

### 3.6 About downloaded cards
- **Don't use card-platform V2 cards as references for character definitions.** Good ones are rare. The well-made ones are usually world-type cards (isekai or fantasy worlds). For good examples, look in the Discords of API and frontend providers, and of the LLM fine-tuning groups on Hugging Face.
- Scenario ideas on those platforms can still be fun (for example, a short ERP), but **review the card first**: fix spelling, remove "elephants", rewrite the character in more detail with at least a personality, and tell the AI how to interact with you and what your goal is.
- Say whether the AI should **actively engage or wait for you**. Depending on the model, interactions can get quite aggressive. Abliterated models in particular are hard to keep SFW if you want the plot to build slowly, so addressing this directly in the card works better than trying to play it safe early on.

### 3.7 Character images
Use Stable Diffusion or a similar model. Make an image you like and **save the seed**. Reusing that seed keeps later images close to the first, so you can ask for different moods and use them for ST's expressions setup. Expect small deviations, and reset to the seed each time. ComfyUI has automated workflows for this, but they are much more complicated to set up, though faster once running.

---

## 4. Where ideas come from

- **Start from an idea:** picture the theme or topic. Movies, fiction and real people are good sources. Choose between a stereotype and a fresh scenario, imagine who you'd meet there and how you'd interact, then write the character.
- **Start from the character:** approach it like making an RPG character, or freehand it. Decide on a good or bad archetype, personality and looks. Imagine a dialogue where you talk about each other and how they'd present themselves. Add flaws, dislikes and fears, and **goals for direction**. Appearance can come last, since it rarely matters much in RP. What matters is that the AI has enough to reproduce the portrayal you want.
- **Brainstorm:** write "what my character should be and do" in the middle of a sheet of paper and set a 10-minute timer. Write down every thought, one word if possible, without dwelling on any. Then group the words into character, scenario, and backstory or interaction material, and continue with one of the two approaches above. If nothing comes, download a card and try another day. It's a hobby.

---

## 5. From the comments

### Keeping the character definition strong in long contexts / the first message dominating
`The Wandering Cat` uses 32k contexts. The first message stays in context a long time and over-steers the character, but they don't want to cut context.
- `Peter`, first answer: delete the first message by hand after a few replies. Or set ST's context size **smaller than the API's** (e.g. 8k) and raise it to 32k once you hit the limit, since ST always truncates to its own setting. Or move the first message into WI with an entry that expires after X replies; WI has an option for this.
- `underscore_x #banana`: **no need to delete it. Run `/hide 0`**, or click the **eye icon** above any message. Hidden messages stay visible in the chat but are left out of the prompt.
- `Peter`, better answer: as chat history grows it pushes the card into irrelevance, until the chat rather than the card defines the character. **Put the description in the Character's Note at depth 4** so it stays near the bottom of the context and stays relevant. This probably works even without removing the first message. Details are in his other guide, "Token, Context, APIs, Bs, Huggi…" (title truncated in the source).
- `The Wandering Cat` gave the menu path: open the **book-shaped icon** in the character card (Advanced Definitions), paste the description into **Character's Note**, and leave it at system role, **depth 4**. It is stored permanently on the card. Screenshots are linked below. Don't confuse it with the Author's Note, which is per-chat.
- Inputs that support @depth insertion (per `Peter`): Character's Note, Author's Note, System Note (optionally configurable), Persona, World Info. `underscore_x` added: **with Chat Completion, basically anything in the Prompt Manager** can be placed at depth.

### Top or bottom? Description vs lorebook? Does anything objectively win? (`Ghalfal` ↔ `Peter`)
`Ghalfal` found guides contradicting each other on putting important information at the top or the bottom. He has had success with **PList + Ali:Chat in one constant lorebook entry and an empty Description**, and asked what is objectively best. `Peter` answered:
- **Important information goes at the bottom.** That part is clear.
- The reason to **split PList from Ali:Chat** is that a PList in the Author's Note can be inserted **at a depth (e.g. 4, near the bottom)**, so chat history doesn't push it up.
- **Description box vs a constant lorebook entry: little difference for the LLM.** Both are permanent. They are inserted in slightly different positions, which depend on your ST configuration. Check your raw context to see.
- Personally he dislikes putting the PList in the Author's Note because it's **bound to the chat**, and he kept forgetting which chat held it.
- **Nothing is objectively testable** as far as he knows: sampling randomness means the same question gets different answers, and he knows of no paper or list that tested formats. His min-max method: fix a small matrix (e.g. 5 models at comparable parameter counts and quants), write the same character in each style, write a fixed list of conversation questions, ask every model and style combination, rate the answers, and fill in the matrix. He suspects format differences are too small to show up in a blind test with few testers. He compares this to model benchmarks disagreeing, and prefers user blind-comparison leaderboards for RP.
- The same style can be done well or badly. Natural language full of tangled sentences and slang reads poorly, and errors in JED or Ali:Chat hurt too. His advice: don't over-optimize, regenerate or edit bad replies, and treat going off the rails as part of RP. If optimizing is your hobby, build the test framework and share the comparison.
- `underscore_x`: you can't really define "better" here, so you can't min-max it.
- `Peter` mentioned he uses a personally modified version of the **Inception presets** (Methception / LLamaception / Qwenception): <https://huggingface.co/Konnect1221/The-Inception-Presets-Methception-LLamaception-Qwenception>

### Example dialogue: critique and alternatives (`NTZRAEL`, `underscore_x`, `TNighthawk`)
`NTZRAEL`'s insights from refining cards since the Pygmalion days (verbatim):
```
- Example dialogue is NOT needed, and the interview style recommended by Ali;Chat has inherent weaknesses; namely they sabotage the impersonation function (you're instructing the model that the user speaks only in clipped single line questions) and they prime the character to only answer questions or describe things instead of moving a scene forward.
- A good example dialogue (imo) needs to convey info like: accent/writing style, complicated new concepts (like how a character's magic powers work, include them USING the power), and most importantly a character's sense of agency. End your example dialogues in things that 'turn the page' like going through a door, getting into a car, making a decision, asking the user a question, etc.
- Expanding on the above, unless you're purely making a chat bot where you're trading one line responses, reimagine Example Dialogues as instead Example Scenes. Set the scene your character exists in, use them to expand the setting, give the character signposts where to guide the story. Do [ Scene: {{User}} has asked {{Char}} where their powers come from. ] instead of interview questions.
- Every style of character writing can and should be used together, p-list + plaintext for complicated concepts or world history can produce lovely things, don't limit yourself. Just send instructiony things like dry concept explanations and p-lists as a System prompt or your character WILL start sounding like an encyclopedia. Keep the division between 'information about the character and world' and the actual 'character' as clean as possible.
- P-listing lets you break english down into its essentials, you can simplify plaintext concepts while still conveying the message, especially if that info can be 'implied'. 'Mary had a little lamb with white wool but she lost it in the woods' can become 'lost lamb in woods' and most models will understand perfectly.
```
- `underscore_x`: example dialogue doesn't have to be user/char pairs or interview style, but they **always** recommend including it, in the style of NTZRAEL's second point (voice, concepts, agency).
- `TNighthawk`: by default ST puts the **Example Messages** box at the start of the context and then **drops it** as the chat fills. If you want it to stay, move it somewhere permanent, such as a lorebook. His own setup: characters are lorebook entries in a large open world. The "character" card only says it is a **GM** and gives guidelines for running the RP. He has about 6 alternate first messages, most of them letting the user's first input set the scene.

### A token-squeezed card, reviewed (`Count Six` ↔ `Peter`)
`Count Six` tried a punctuation-free, token-efficient format. Personalities blended together on non-reasoning models, which tend to be agreeable, and complex relationships and chronology got misread. His sample, excerpted:
```
Karl Stephenson
49 heterosexual British male human
Tall broad-shouldered ruggedly handsome distinctive jawline dark brown hair thinning at temples blue eyes
Small scar above left eyebrow from bar fight in youth
...
Memories of first wife Jennifer’s smile laughter comfort during his low moments, day he met current wife Luna her vitality
Recalls Jennifer’s death from cancer when Emily was very young devastated by loss terrified of repeating the pain
...
```
`Peter` found it hard to read and expected an LLM to struggle too. His quick rewrite groups a PList-style header with natural-language prose:
```
[Name: Karl Stephenson (49, heterosexual British male human); 

Body: 6'2" (188 cm), broad-shouldered, muscular build, dark brown hair thinning at temples, blue eyes, small scar above left eyebrow, ruggedly handsome with a distinctive jawline; 

Clothes: Casual yet stylish—button-down shirts, dark jeans, polished boots; 

Scenario: A former real estate businessman now retired, enjoying family life and considering a culinary venture with his wife; 

Setting: A cozy countryside home with a well-stocked library and a kitchen always filled with the aroma of experimental dishes; 

Tags: Family Man, Protective, Intellectual, Culinary Enthusiast, Former Businessman; 

Persona: Confident, analytical, deeply emotional, fiercely loyal, natural leader, strong sense of justice, protective of loved ones, opinionated but fair, enjoys lively debates, fears losing loved ones;

Description: Karl is a man of contrasts—ruggedly handsome with a commanding presence, yet deeply emotional and fiercely loyal. His blue eyes reflect a lifetime of experiences, from the loss of his first wife to the joy of raising his daughter. He dresses casually but stylishly, his muscular build a testament to years of hard work and discipline. His voice is deep and resonant, evoking the wisdom of an elder, and he often rubs his chin thoughtfully when considering problems. He is a natural leader, protective of his family and friends, and always willing to defend them. His love for food and company is matched only by his voracious appetite for reading and intellectual discussions. He is a man of honor, believing in doing the right thing even when it's difficult, and he thrives on lively debates and creative problem-solving. 

Backstory: Born and raised in a small town in the English countryside, Karl grew up in a loving family with two parents. He met his first wife, Jennifer, in college, and they married until her untimely death from cancer when their daughter, Emily, was very young. Devastated by the loss, Karl later met Luna, his current wife, and fell deeply in love. He is a former real estate businessman who amassed a fortune but is now retired, focusing on his family and considering a new venture in the culinary business with Luna. He is proud of his daughter, Emily, who has the best qualities of both his wives, and his step-son, Andrew, for looking ahead after a crippling car accident. Karl is a man of integrity, with no criminal record, and is known for his emotional intelligence and ability to read people and situations creatively.]
```
(Some details in the rewrite, such as 6'2" and polished boots, were added by Peter and aren't in the original.)
- Peter's key point: **the categories weren't the main change. Clear, easy-to-read sentences were.** Modern models are trained on natural language, so spend the tokens.
- Count Six had run the profile through an LLM prompt that stripped punctuation, because DeepSeek had told him LLMs don't need it. He concluded that was probably a hallucination.
- Peter: "If a character isn't human readable anymore or not structured to the way you think then it's a bad char." A card you enjoy refining beats one that saves 200 tokens but that only an AI wants to work on.
- For more card feedback, Peter pointed to the `🧙┃prompt-crafting` channel.

### Structure vs prose (`TomMalufe`, `Petra`)
- `TomMalufe`: ask ChatGPT how LLMs process context. His summary: **stay structured and avoid walls of text**. Short, clear instructions beat flowery prose. Markdown or HTML headers and bullets are formats LLMs are trained to parse.
- `Petra`: when she asked Gemini, it said PList was more efficient than a Markdown template because of its structure, but she isn't sure it wasn't hallucinating. TomMalufe: that holds if efficiency is the goal, since fewer characters means fewer tokens. He thinks the underlying advice is consistent structure over rambling paragraphs.
- Note: this "structure over prose" view partly conflicts with Peter's and Count Six's experience that clear natural-language sentences beat compressed notation. The thread doesn't settle it, and the author's position stays "whatever is clear and fun to maintain".

---

## 6. Links & resources

- JED (Just Enough Definition) guide + template: <https://rentry.co/CharacterProvider-GuideToBotmaking> (embed image: <https://files.catbox.moe/t1otdw.png>)
- PList + Ali:Chat introduction (Trappu, Pygmalion wiki mirror): <https://wikia.schneedc.com/bot-creation/trappu/introduction> (anchors `#plists`, `#what-is-alichat`)
- Ali:Chat original (AliCat, v1.5): <https://rentry.co/alichat> (embed image: <https://files.catbox.moe/kzn6bn.png>)
- MinimALIstic / Ali:Chat Lite (kingbri): <https://rentry.co/kingbri-chara-guide> (formatting image: <https://github.com/bdashore3/AI-Art-Guide/blob/default/chara-guide-assets/st-pyg-formatting.png?raw=true>)
- Inception presets (Methception / LLamaception / Qwenception), which Peter uses in modified form: <https://huggingface.co/Konnect1221/The-Inception-Presets-Methception-LLamaception-Qwenception>
- Screenshot: the book icon in the character panel that opens Advanced Definitions (`The Wandering Cat`): <https://cdn.discordapp.com/attachments/1344596229098573844/1344643764638978181/image.png> (signed URL, likely expired)
- Screenshot: the Character's Note field in Advanced Definitions at system depth 4 (`The Wandering Cat`): <https://cdn.discordapp.com/attachments/1344596229098573844/1344644095540334663/image.png> (signed URL, likely expired)
- Related `st-guides` threads referenced by title only (no URLs in the source): "Token, Context, APIs, Bs, Huggi…" (Peter's context guide), "Getting started with World Info…", "Getting the most out of WorldIn…"; plus the `🧙┃prompt-crafting` channel for card feedback.

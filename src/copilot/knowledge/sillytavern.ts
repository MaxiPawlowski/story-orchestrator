import type { StTopic } from "./types";

export const ST_PINNED_VERSION = "1.19.0";

const SCRIPT = "public/script.js";
const WORLD_INFO = "public/scripts/world-info.js";
const GROUPS = "public/scripts/group-chats.js";

export const ST_TOPICS: readonly StTopic[] = [
  {
    id: "card-fields",
    title: "Character card fields and where they land",
    audience: "author",
    text: "description, personality and scenario sit in every prompt for that character; keep the description in clear third-person sentences under light headings. "
      + "A chat or group scenario override replaces the card's scenario. mes_example (example dialogue) is pushed out as the chat grows unless examples are pinned. "
      + "The Character's Note (depth prompt, default depth 4, system role) is injected near the bottom and survives long chats. creator_notes never reach the model. "
      + "Card tags are metadata only; filter tags live in SillyTavern's own tag list.",
    sources: [{ file: SCRIPT, anchor: "depth_prompt" }, { file: SCRIPT, anchor: "scenario_override" }, { file: "public/scripts/power-user.js", anchor: "pin_examples" }],
  },
  {
    id: "first-message",
    title: "First message (greeting)",
    audience: "author",
    text: "The greeting sits at the bottom of the context when a chat starts, so it sets the reply length, point of view, format and tone the model copies. "
      + "Write it the way you want replies to look, with one convention (narration plus quoted speech, or actions in asterisks). Never write what the player does, "
      + "says or feels: the model learns to speak for the player. An empty first_mes means the chat opens with no message. Alternate greetings become swipes of the "
      + "first message in one-on-one chats. In a story, only the opening scene's cast gets a greeting.",
    sources: [{ file: SCRIPT, anchor: "alternate_greetings" }, { file: SCRIPT, anchor: "first_mes" }],
  },
  {
    id: "example-dialogue",
    title: "Example dialogue",
    audience: "author",
    text: "Example dialogue shows what a description cannot: voice, accent, how a power works in use. Split it into blocks that start with <START>; a missing first "
      + "<START> is added for you. On Chat Completion, a block with no {{char}}: or {{user}}: line is dropped, so every block needs at least one {{char}}: line. "
      + "Prefer short scenes that end on a decision or a question over interview-style question and answer, which teaches the model that the player speaks in one-line questions.",
    sources: [{ file: "public/scripts/openai.js", anchor: "parseExampleIntoIndividual" }],
  },
  {
    id: "card-review",
    title: "Card review checklist",
    audience: "author",
    text: "A good card: a non-empty description of about 200 to 2000 tokens (keep about half the context for the chat itself); a few core traits, each shown by behaviour "
      + "rather than adjectives; goals of their own that do not revolve around the player; abilities with a cost or a limit; one formatting convention; no line that "
      + "narrates the player; no instruction phrased as \"never X\" (it plants X). Long lists of places or spells belong in a lorebook entry, not the card. "
      + "The name is short, unique on the install, and not a famous one the model already knows.",
    sources: [{ file: SCRIPT, anchor: "depth_prompt" }],
  },
  {
    id: "card-names",
    title: "Card names",
    audience: "author",
    text: "The server strips characters a file name cannot hold (/ ? < > \\ : * | \" and trailing dots), so \"Dr. Who?\" is saved as \"Dr. Who\". A second card with the "
      + "same name is not refused: it gets a numbered avatar file and the same display name, which makes two characters indistinguishable to a story. In a group, a "
      + "member is mentioned when any word of its name appears in a message, so a name containing an everyday word (\"So\", \"The\") is mentioned constantly. "
      + "Prefer short ASCII names made of uncommon words.",
    sources: [{ file: "src/endpoints/characters.js", anchor: "sanitize" }, { file: GROUPS, anchor: "extractAllWords" }],
  },
  {
    id: "groups",
    title: "Group chats",
    audience: "author",
    text: "A new group chat posts the greeting of every member that has one, so leave supporting members' first message empty. Talkativeness (default 0.5) is the chance a "
      + "member speaks unprompted; 0 means only when mentioned. Swap mode (the default) sends only the speaker's card and that speaker's Character's Note; join modes "
      + "merge every member's card, which can blur personalities. Muted members never speak. Story Orchestrator stories play in group chats only, and speaker direction "
      + "picks who answers.",
    sources: [{ file: GROUPS, anchor: "talkativeness" }, { file: GROUPS, anchor: "getGroupDepthPrompts" }],
  },
  {
    id: "lorebook-entries",
    title: "Lorebook entries: keys, position and order",
    audience: "author",
    text: "A World Info entry fires when one of its keys appears in the scanned text; secondary keys with a logic (AND ANY, AND ALL, NOT ANY, NOT ALL) narrow it. Position "
      + "says where the text lands: before or after the character definitions, in the author's note, at a depth in the chat (with a role), or an outlet. Depth 0 is the "
      + "bottom of the chat. Order decides who wins when the budget runs out, higher first. An entry written without a position still activates but lands nowhere useful, "
      + "so set every field. Macros like {{char}} resolve in keys and content.",
    sources: [{ file: WORLD_INFO, anchor: "world_info_position" }, { file: WORLD_INFO, anchor: "world_info_logic" }, { file: WORLD_INFO, anchor: "DEFAULT_DEPTH" }],
  },
  {
    id: "lorebook-activation",
    title: "Lorebook activation: constant, scan depth, recursion, timing",
    audience: "author",
    text: "A constant entry is always in context and skips every key check, secondary keys included: that is how you make an entry always on. Scan depth is how many recent "
      + "messages are searched for keys; depth 0 matches nothing. Recursion lets an activated entry's text activate others; an entry can opt out (prevent recursion). "
      + "Probability makes an entry fire only some of the time. Inclusion groups keep one entry of a group. Sticky keeps an entry on for some messages after it fires, "
      + "cooldown blocks it for some messages, delay waits until the chat is long enough; editing an entry resets its timers.",
    sources: [
      { file: WORLD_INFO, anchor: "world_info_depth" }, { file: WORLD_INFO, anchor: "preventRecursion" }, { file: WORLD_INFO, anchor: "useProbability" },
      { file: WORLD_INFO, anchor: "sticky" },
    ],
  },
  {
    id: "lorebook-budget",
    title: "Lorebook budget",
    audience: "author",
    text: "World Info has a token budget (a share of the context, optionally capped). Activated entries are added by order until the budget is spent and the rest are dropped "
      + "silently, so a long constant entry can crowd out keyed ones. Keep entries short and focused on one thing, and give the entries that must survive a higher order.",
    sources: [{ file: WORLD_INFO, anchor: "world_info_budget" }],
  },
  {
    id: "lorebook-binding",
    title: "Which lorebooks a chat scans",
    audience: "author",
    text: "A chat scans the globally selected books, the chat's own book, the persona's book and the books bound to its characters. Creating a book does not select it. "
      + "Story Orchestrator never selects a story's book globally: it adds the books a story lists under requirements to the scans of the chats that play that story "
      + "only, so two stories never share lore. A story book left selected globally shows up as a Repair row.",
    sources: [{ file: WORLD_INFO, anchor: "createNewWorldInfo" }],
  },
  {
    id: "authors-note",
    title: "Author's Note",
    audience: "author",
    text: "The Author's Note is a block injected into the chat at a depth (default 4) or at the top, with a role (system, user or assistant) and an interval: it is "
      + "inserted every N messages. Entries placed in the author's note position only land on turns where the note itself is inserted. A checkpoint's author_note effect "
      + "writes this note for the chat while that checkpoint is active.",
    sources: [{ file: "public/scripts/authors-note.js", anchor: "note_depth" }, { file: "public/scripts/authors-note.js", anchor: "note_role" }],
  },
  {
    id: "connection-profiles",
    title: "Connection Manager profiles",
    audience: "setup",
    text: "A Connection Manager profile saves an API, a model, a preset and an endpoint under one name; /profile <name> switches to it. Story Orchestrator sends its own "
      + "work (reading the chat, summaries, the wizard, speaker direction, the curator) to a profile you pick under Memory model, and Models per task can send each task "
      + "to its own profile. Your chat model stays whatever is selected in SillyTavern.",
    sources: [{ file: "public/scripts/extensions/connection-manager/index.js", anchor: "name: 'profile'" }],
  },
  {
    id: "image-generation",
    title: "Image generation and expressions",
    audience: "setup",
    text: "SillyTavern's Image Generation extension draws with /sd (alias /imagine) through the backend set in its settings, and can ask a language model to turn the scene "
      + "into an image prompt. /bg switches the chat background. Expressions show a character sprite per emotion from a folder named after the card. Story Orchestrator's "
      + "illustrations and sprite stage reuse these: a story's appearance text describes each character for pictures and sprites.",
    sources: [
      { file: "public/scripts/extensions/stable-diffusion/index.js", anchor: "name: 'imagine'" },
      { file: "public/scripts/extensions/expressions/index.js", anchor: "sendExpressionCall" },
      { file: "public/scripts/slash-commands.js", anchor: "name: 'bg'" },
    ],
  },
  {
    id: "regex-and-quick-replies",
    title: "Regex scripts and Quick Replies",
    audience: "author",
    text: "A regex script rewrites text by pattern, chosen by placement (your input, AI output, slash commands, World Info) and by whether it changes what is shown, what is "
      + "sent, or both. Quick Replies are saved buttons that run slash-command scripts; a reply can run automatically on events or when a World Info entry with its "
      + "automation id fires. Both apply to every chat, so test them on a story chat before relying on them.",
    sources: [{ file: "public/scripts/extensions/regex/engine.js", anchor: "regex_placement" }, { file: "public/scripts/extensions/quick-reply/src/QuickReply.js", anchor: "automationId" }],
  },
  {
    id: "macros",
    title: "Macros",
    audience: "author",
    text: "{{char}} and {{user}} resolve to the current character and the player's persona name in cards, notes, presets and lore. Story Orchestrator adds {{story_*}} macros "
      + "(title, current checkpoint, tension, memory tiers, a quality's value); each answers a placeholder when no story plays. {{story_possible_transitions}} spoils the "
      + "story and is for authors only.",
    sources: [{ file: "public/scripts/macros/definitions/env-macros.js", anchor: "registerMacro('char'" }],
  },
];

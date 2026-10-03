export interface SlashVerb {
  verb: string;
  usage: string;
  what: string;
}

export const STORY_VERBS: readonly SlashVerb[] = [
  { verb: "recap", usage: "/story recap", what: "where the story is right now" },
  { verb: "threads", usage: "/story threads", what: "what is still open" },
  { verb: "chapters", usage: "/story chapters", what: "the chapters that have ended" },
  { verb: "chapter", usage: "/story chapter <n>", what: "the summary of one ended chapter" },
  { verb: "chronicle", usage: "/story chronicle export", what: "copy the story so far as Markdown" },
  { verb: "flag", usage: "/story flag [note]", what: "mark this moment for the author to look at" },
  { verb: "help", usage: "/story help", what: "this list" },
];

export const STORY_HELP_STRING = `Story Orchestrator, safe for players: ${STORY_VERBS.map((entry) => `${entry.usage.replace("/story ", "")} (${entry.what})`).join(", ")}`;

export const storyHelpText = (): string => ["Story commands:", ...STORY_VERBS.map((entry) => `• ${entry.usage}: ${entry.what}`)].join("\n");

export const SO_MEM_VERBS: readonly SlashVerb[] = [
  { verb: "list", usage: "/so-mem list", what: "what the story remembers, numbered" },
  { verb: "pin", usage: "/so-mem pin <number> on|off", what: "keep a memory in every prompt, or stop keeping it" },
  { verb: "exclude", usage: "/so-mem exclude <number>", what: "remove a memory the story got wrong" },
  { verb: "backlog", usage: "/so-mem backlog", what: "author tool: read older messages into memory" },
];

export const SO_MEM_HELP_STRING = `Story Orchestrator memory: ${SO_MEM_VERBS.map((entry) => `${entry.usage.replace("/so-mem ", "")} (${entry.what})`).join(", ")}`;

export const soMemHelpText = (): string => ["Memory commands:", ...SO_MEM_VERBS.map((entry) => `• ${entry.usage}: ${entry.what}`)].join("\n");

export const CP_HELP_STRING = "Story Orchestrator author tools (spoils the story; players want /story): list, state, activate <id>, set <quality> <value>, converge, chapters, seal, unseal <recordId>; "
  + "debug: extract [response], expand [response]";

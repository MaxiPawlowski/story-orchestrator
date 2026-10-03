export interface JargonEntry {
  term: string;
  plain: string;
}

export const JARGON: readonly JargonEntry[] = [
  { term: "Smoothing α", plain: "how strongly the newest scene moves the tension" },
  { term: "α", plain: "how strongly" },
  { term: "Cadence", plain: "read the chat every … messages" },
  { term: "Reconcile", plain: "look further back when stuck" },
  { term: "Lag", plain: "wait before reading the newest messages" },
  { term: "shared read extraction", plain: "reading the chat" },
  { term: "shared read", plain: "reading the chat" },
  { term: "extraction", plain: "reading the chat" },
  { term: "epistemic", plain: "what each character knows" },
  { term: "ledger", plain: "tracked values" },
  { term: "Stagecraft", plain: "background helpers" },
  { term: "gating", plain: "how lorebook entries switch on" },
  { term: "Expansion variants", plain: "outlines per gap" },
  { term: "measured floor", plain: "until it is measured" },
  { term: "floor", plain: "the bar it must pass" },
  { term: "blackboard", plain: "story state" },
  { term: "boundary", plain: "reply" },
  { term: "quality", plain: "story value" },
  { term: "checkpoint", plain: "turning point" },
  { term: "injection", plain: "added to the prompt" },
  { term: "World Info curator", plain: "lorebook curator" },
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const patternOf = (term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}(?=$|[^\\p{L}\\p{N}])`, "iu");

export const jargonIn = (text: string): JargonEntry[] => JARGON.filter((entry) => patternOf(entry.term).test(text));

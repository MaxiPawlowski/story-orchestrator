import type { Feature } from "./registry";
import { featureAt } from "./where";

const at = (control: string, label: string) => featureAt("memory", control, `Prompt memory › ${label}`);

export const MEMORY_WAVE_FEATURES: readonly Feature[] = [
  {
    id: "compaction-tokens", name: "Real token counts for chunked dropping", area: "memory", audience: "author",
    oneLine: "Chunked dropping of old messages measures them with the model's own tokenizer.",
    what: "When old messages leave the prompt in chunks near the context limit, each message is measured with the tokenizer SillyTavern uses for the model, "
      + "not a length estimate, so SillyTavern does not trim further messages between two cuts. Counts are cached per message. Only matters while chunked dropping is on.",
    where: at("compactionTokens", "Count real tokens when dropping old messages"),
    settings: ["memory.compactionTokens"], doc: "player/memory.md", status: "shipped", needs: ["story", "group-chat"],
  },
  {
    id: "summary-guard", name: "Recent summary keeps its names", area: "memory", audience: "author",
    oneLine: "A rolling summary that loses a name or collapses is refused and the previous one kept.",
    what: "The recent-messages summary is rewritten every few replies. A rewrite is refused when it drops a person, place or thing the previous summary named and "
      + "no other memory still holds it, or when it shrinks below 60% of the previous summary; the previous summary stays. The summary also records the names it holds, "
      + "so memory selection can find it. No model call.",
    where: at("summaryGuard", "Keep the recent summary from losing names"),
    settings: ["memory.summaryGuard"], doc: "player/memory.md", status: "shipped", needs: ["story", "memory-profile"],
  },
  {
    id: "supersede-verdicts", name: "Settle old and new versions while idle", area: "memory", audience: "author",
    oneLine: "Unclear pairs of an older and a newer memory are settled by one short question while nothing is generating.",
    what: "Consolidation leaves some pairs undecided: maybe the newer memory replaces the older, maybe both are true. These pairs wait, and while no reply is being "
      + "written the memory model gets one batched question for up to 8 of them. The answers apply at the next reply: the older memory is retired, or the pair is "
      + "kept as two memories. A swipe or edit of either side takes the answer back; a locked or established memory goes to the conflict list instead.",
    where: at("supersedeVerdicts", "Settle unclear old-versus-new memories while idle"),
    settings: ["memory.supersedeVerdicts"], doc: "player/memory.md", status: "shipped", needs: ["story", "memory-profile"],
  },
  {
    id: "place-fold", name: "Places and things under the story's names", area: "memory", audience: "author",
    oneLine: "A place, group or thing the story names is recorded under the story's spelling.",
    what: "The state the story read records about places, groups and things is filed under the name the story uses (its place pages and their aliases, place lore, "
      + "scene places, factions), so two spellings of one place are one entry. Only exact matches after case and a leading \"the\" are folded; a name that fits two "
      + "story names, or none, stays as written. No model call.",
    where: at("placeFold", "Match places and things to the story's names"),
    settings: ["memory.placeFold"], doc: "player/memory.md", status: "shipped", needs: ["story", "memory-profile"],
  },
];

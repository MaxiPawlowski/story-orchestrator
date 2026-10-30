import type { Feature } from "./registry";
import { drawerAt } from "./where";

export const THREAD_FEATURES: readonly Feature[] = [
  {
    id: "threads-put-off", name: "Threads you put off", area: "memory", audience: "player",
    oneLine: "A topic you put off in your own words stops being pushed until you bring it up again.",
    what: "When you say \"later\" or \"not now\" about an open thread, the story marks it as put off, using your exact words as the evidence. "
      + "It is no longer offered as the current thread, your thread list shows it as put off, and What could I do? can still suggest it. "
      + "It is picked up again the moment you mention it yourself; nothing brings it back on a timer. A character saying later never counts. "
      + "A swipe or edit takes the change back. Leaving put-off threads out of the characters' prompt is a separate control, off until it is rated.",
    where: drawerAt("#so-feature-deferrals-enabled", "Features › Threads you put off"),
    settings: ["memory.deferrals", "memory.deferredOutOfPrompt"], doc: "player/memory.md", status: "shipped", needs: ["story", "group-chat", "memory-profile"],
  },
];

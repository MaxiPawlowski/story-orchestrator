import type { GuideTopic } from "./guideTopics";

export const CARRY_TOPICS = {
  outcome: {
    title: "Outcome a next story can carry",
    fields: "outcome[], key, heritage_text",
    text: "outcome [{key, heritage_text {value: line}}]: up to 12 keys a sequel or replay may carry from a finished run (a final chapter sealed). A key is an authored quality, "
      + "a quest's quest_<id>_closed or a faction's rep_<id>; never code, tension or liv_ keys. Only a value the player saw at the end carries: heritage_text for it, "
      + "else player_labels, else the quality's display label, a quest that was visible, a faction that was visible (band word). The epilogue is told from these lines only.",
  },
  "carry-from": {
    title: "Carry from a finished run",
    fields: "carry_from.story, carry_from.mode, carry_from.map, carry_from.replay_map, carry_from.previously, carry_from.default, from, to, as, known_by",
    text: "carry_from {story, mode sequel|replay, map [{from (an outcome key), to, as heritage|state, known_by [ids]|all|none}], replay_map, previously, default snapshot|require}. "
      + "heritage lands in a heritage_ quality (source code, written only by the carry; gates may read it); state lands in an ordinary extractor quality. A replay (story = own id) "
      + "carries heritage only unless replay_map names a key no transition, quest or milestone gate reads. known_by members get a private line (default nobody). "
      + "The start pane lists verified finished runs; picking pins a copy. A \"Previously…\" block lasts until the first seal, 12 turns or dismiss.",
  },
} as const satisfies Record<string, GuideTopic>;

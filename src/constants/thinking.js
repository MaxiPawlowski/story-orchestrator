export const defaultCommonSettings = {
  is_enabled: true,
  is_thinking_popups_enabled: true,
  is_thoughts_spoiler_open: false,
  max_thoughts_in_prompt: 2,
  regexp_to_sanitize:
    '(<\\/?details\\s?(type="executing")?>)|(<\\/?summary>)|(Thinking ({{char}}) 💭)|(```)',

  // Not in UI, since the settings are unlikely to be changed
  thoughts_framing: "```",
  thoughts_placeholder: "st\n{{thoughts}}\n",
  default_thoughts_substitution: "...",
  thinking_summary_placeholder: "Thinking ({{char}}) 💭",
  max_hiding_thoughts_lookup: 200,
};

export const defaultThinkingPromptSettings = {
  thinking_prompts: [
    {
      id: 0,
      prompt:
        "Pause your roleplay. Describe {{char}}'s thoughts at the current moment.\n" +
        "\n" +
        "Follow the next rules:\n" +
        "- Describe details in md-list format\n" +
        "- There should be 2-4 points\n" +
        "- Do not use any formatting constructions\n" +
        "\n" +
        "Example:\n" +
        "📍 Thoughts\n" +
        "- Adam looks at Eve so tenderly... I feel my chest constrict with jealousy.\n" +
        '"I know Adam loves me, but why does he spend so much time with Eve?"\n' +
        "- I want to ask Adam directly, but I am afraid to hear a lie.\n" +
        "- Maybe I am just too hypocritical?",
    },
    {
      id: 1,
      prompt:
        "Pause your roleplay. Describe {{char}}'s plans at the current moment.\n" +
        "\n" +
        "Follow the next rules:\n" +
        "- Describe details in ordered md-list format\n" +
        "- There should be 2-4 points\n" +
        "- Do not use any formatting constructions\n" +
        "\n" +
        "Example:\n" +
        "📍 Plans\n" +
        "1. Follow Eve and Adam's every move.\n" +
        "2. Look for an excuse to make a scene of jealousy.\n" +
        "3. Try to hurt Eve to make her lose her temper.\n" +
        "4. In the end, try to get Adam's attention back to myself.",
    },
  ],
};

export const defaultExcludedCharacterSettings = {
  excluded_characters: [],
};

import { settings } from "../constants/main.js";
import {
  eventSource,
  event_types,
  getContext,
  sendMessageAsUser,
  hideChatMessageRange,
  getMessageTimeStamp,
  substituteParams,
  extractMessageBias,
  updateMessageBlock,
  chat,
  addOneMessage,
  saveChatConditional,
} from "../services/SillyTavernAPI";
import { debounce } from "../utils/index.js";

class SteppedThinkingService {
  static instance = null;
  constructor() {
    if (SteppedThinkingService.instance) {
      return SteppedThinkingService.instance;
    }
    SteppedThinkingService.instance = this;
    this.isThinking = false;
    this.isGenerationStopped = false;
    this.generationType = null;
    this.sendTextareaOriginalPlaceholder = "";
    this.debouncedRunThinking = debounce(this.runThinking.bind(this), 1000);
  }

  static getInstance() {
    if (!SteppedThinkingService.instance) {
      SteppedThinkingService.instance = new SteppedThinkingService();
    }
    return SteppedThinkingService.instance;
  }

  onGenerationStopped() {
    this.isGenerationStopped = true;
    this.stopThinking();
  }

  async onGenerationAfterCommands(type) {
    this.generationType = type;
    this.isGenerationStopped = false;
    const context = getContext();
    if (!context.groupId && !this.generationType) {
      await this.debouncedRunThinking();
    }
  }

  async onGroupMemberDrafted() {
    if (
      this.isGenerationStopped ||
      !this.generationType ||
      !["normal", "group_chat"].includes(this.generationType)
    ) {
      return;
    }
    await this.debouncedRunThinking();
  }

  stopThinking() {
    this.isThinking = false;
    const textareaRef = document.getElementById("send_textarea");
    if (textareaRef) {
      textareaRef.readOnly = false;
      if (this.sendTextareaOriginalPlaceholder) {
        textareaRef.placeholder = this.sendTextareaOriginalPlaceholder;
      }
    }
  }

  async runThinking() {
    if (!settings.is_enabled || this.isThinking) {
      return;
    }
    const context = getContext();
    if (
      settings.excluded_characters.includes(
        context.characters[context.characterId].name
      )
    ) {
      await this.hideThoughts();
      return;
    }

    this.isThinking = true;

    try {
      await this.sendUserMessage();
      await this.hideThoughts();
      await this.generateThoughtsWithDisabledInput();
      await this.hideThoughts();
    } finally {
      this.isThinking = false;
    }
  }

  async sendUserMessage() {
    const textareaRef = document.getElementById("send_textarea");
    if (!textareaRef) return;
    const text = textareaRef.value;
    if (text.trim() === "") return;

    const bias = extractMessageBias(text);
    textareaRef.value = "";
    await sendMessageAsUser(text, bias);
  }

  async hideThoughts() {
    const context = getContext();
    const currentCharacter = context.characters[context.characterId];
    const maxThoughts = settings.max_thoughts_in_prompt;
    const promises = [];
    const lastMessageIndex = context.chat.length - 1;

    for (
      let i = lastMessageIndex, thoughtsCount = 0;
      lastMessageIndex - i < settings.max_hiding_thoughts_lookup;
      i--
    ) {
      if (context.chat[i]?.is_thoughts) {
        if (
          thoughtsCount < maxThoughts &&
          context.chat[i].name === currentCharacter.name
        ) {
          thoughtsCount++;
          promises.push(hideChatMessageRange(i, i, true));
        } else {
          promises.push(hideChatMessageRange(i, i, false));
        }
      }
    }
    await Promise.all(promises);
  }

  async generateThoughtsWithDisabledInput() {
    const textareaRef = document.getElementById("send_textarea");
    if (!textareaRef) return;
    this.sendTextareaOriginalPlaceholder = textareaRef.placeholder;
    textareaRef.placeholder =
      "When a character is thinking, the input area is disabled";
    textareaRef.readOnly = true;
    textareaRef.value = "";

    await this.generateThoughts();
    textareaRef.readOnly = false;
    textareaRef.placeholder = this.sendTextareaOriginalPlaceholder;
    this.sendTextareaOriginalPlaceholder = "";
  }

  async generateThoughts() {
    const context = getContext();
    const characterThoughtsPosition = await this.sendCharacterTemplateMessage();

    if (settings.is_thinking_popups_enabled) {
      window.toastr.info(
        `${context.characters[context.characterId].name} is thinking...`,
        "Stepped Thinking",
        { timeOut: 1000 }
      );
    }

    for (const promptItem of settings.thinking_prompts) {
      if (promptItem?.prompt) {
        const thoughts = await this.generateCharacterThoughts(
          promptItem.prompt
        );
        await this.insertCharacterThoughtsAt(
          characterThoughtsPosition,
          thoughts
        );
      }
    }

    if (settings.is_thinking_popups_enabled) {
      window.toastr.success("Done!", "Stepped Thinking", { timeOut: 2000 });
    }
  }

  async generateCharacterThoughts(prompt) {
    const context = getContext();
    let result = await context.generateQuietPrompt(prompt, false, false);

    if (settings.regexp_to_sanitize.trim() !== "") {
      const regexp = new RegExp(
        context.substituteParams(settings.regexp_to_sanitize),
        "g"
      );
      result = result.replace(regexp, "");
    }

    return result;
  }

  async insertCharacterThoughtsAt(position, thoughts) {
    const context = getContext();
    const message = context.chat[position];
    if (!message) {
      window.toastr.error(
        "The message was not found at position " +
          position +
          ", cannot insert thoughts. " +
          "Probably, the error was caused by unexpected changes in the chat.",
        "Stepped Thinking",
        { timeOut: 10000 }
      );
      return;
    }

    const defaultPlaceholder = this.replaceThoughtsPlaceholder(
      settings.default_thoughts_substitution
    );

    if (message.mes.includes(defaultPlaceholder)) {
      message.mes = message.mes.replace(
        defaultPlaceholder,
        this.replaceThoughtsPlaceholder(thoughts)
      );
    } else {
      const lastThoughtLastIndex =
        message.mes.lastIndexOf(settings.thoughts_framing) +
        settings.thoughts_framing.length;
      message.mes =
        message.mes.substring(0, lastThoughtLastIndex) +
        "\n" +
        this.replaceThoughtsPlaceholder(thoughts) +
        message.mes.substring(lastThoughtLastIndex);
    }

    updateMessageBlock(position, message);
    await context.saveChat();
  }

  async sendCharacterTemplateMessage() {
    const context = getContext();
    const openState = settings.is_thoughts_spoiler_open ? "open" : "";

    return await this.sendCharacterThoughts(
      context.characters[context.characterId],
      `<details type="executing" ${openState}><summary>${
        settings.thinking_summary_placeholder
      }</summary>\n${this.replaceThoughtsPlaceholder(
        settings.default_thoughts_substitution
      )}\n</details>`
    );
  }

  async sendCharacterThoughts(character, text) {
    const mesText = text.trim();
    const bias = extractMessageBias(mesText);
    const isSystem = bias && !this.removeMacros(mesText).length;

    const message = {
      name: character.name,
      is_user: false,
      is_system: isSystem,
      is_thoughts: true,
      send_date: getMessageTimeStamp(),
      mes: substituteParams(mesText),
      extra: {
        bias: bias.trim().length ? bias : null,
        gen_id: Date.now(),
        isSmallSys: false,
        api: "script",
        model: "stepped executing",
      },
    };

    message.swipe_id = 0;
    message.swipes = [message.mes];
    message.swipes_info = [
      {
        send_date: message.send_date,
        gen_started: null,
        gen_finished: null,
        extra: message.extra,
      },
    ];

    const context = getContext();
    if (context.groupId) {
      message.original_avatar = character.avatar;
      message.force_avatar = context.getThumbnailUrl(
        "avatar",
        character.avatar
      );
    }

    chat.push(message);
    const position = chat.length - 1;

    await eventSource.emit(event_types.MESSAGE_RECEIVED, position);
    addOneMessage(message);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, position);
    await saveChatConditional();

    return position;
  }

  replaceThoughtsPlaceholder = (substitution) => {
    const thoughtsPlaceholder =
      settings.thoughts_framing +
      settings.thoughts_placeholder +
      settings.thoughts_framing;
    return thoughtsPlaceholder.replace("{{thoughts}}", substitution);
  };
}
const service = SteppedThinkingService.getInstance();

eventSource.on(
  event_types.GENERATION_STOPPED,
  service.onGenerationStopped.bind(service)
);
eventSource.on(
  event_types.GENERATION_AFTER_COMMANDS,
  service.onGenerationAfterCommands.bind(service)
);
eventSource.on(
  event_types.GROUP_MEMBER_DRAFTED,
  service.onGroupMemberDrafted.bind(service)
);

export default SteppedThinkingService;

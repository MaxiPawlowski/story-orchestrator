import { useEffect, useState } from "react";
import { settings } from "../../../constants/main";
import {
  defaultCommonSettings,
  defaultExcludedCharacterSettings,
  defaultThinkingPromptSettings,
} from "../../../constants/thinking";
import {
  saveSettingsDebounced,
  getContext,
  event_types,
  eventSource,
} from "../../../services/SillyTavernAPI";

import "../../../services/ChainOfThought";

const ThinkingSettings = () => {
  const [characterList, setCharacterList] = useState([]);
  const [prompts, setPrompts] = useState(
    defaultThinkingPromptSettings.thinking_prompts
  );
  const [isEnabled, setIsEnabled] = useState(defaultCommonSettings.is_enabled);
  const [isThoughtsSpoilerOpen, setIsThoughtsSpoilerOpen] = useState(
    defaultCommonSettings.is_thoughts_spoiler_open
  );
  const [isThinkingPopupsEnabled, setIsThinkingPopupsEnabled] = useState(
    defaultCommonSettings.is_thinking_popups_enabled
  );
  const [regexpToSanitize, setRegexpToSanitize] = useState(
    defaultCommonSettings.regexp_to_sanitize
  );
  const [maxThoughtsInPrompt, setMaxThoughtsInPrompt] = useState(
    defaultCommonSettings.max_thoughts_in_prompt
  );
  const [excludedCharacters, setExcludedCharacters] = useState(
    defaultExcludedCharacterSettings.excluded_characters
  );

  const toggleEnabled = (event) => {
    settings.is_enabled = event.target.checked;
    setIsEnabled(event.target.checked);
    saveSettingsDebounced();
  };

  const toggleThoughtsSpoilerOpen = (event) => {
    settings.is_thoughts_spoiler_open = event.target.checked;
    setIsThoughtsSpoilerOpen(event.target.checked);
    saveSettingsDebounced();
  };

  const toggleThinkingPopupsEnabled = (event) => {
    settings.is_thinking_popups_enabled = event.target.checked;
    setIsThinkingPopupsEnabled(event.target.checked);
    saveSettingsDebounced();
  };

  const onRegexpToSanitizeChanged = (event) => {
    console.log("onRegexpToSanitizeChanged", event.target.value);
    const regexpToSanitize = event.target.value;
    settings.regexp_to_sanitize = regexpToSanitize;
    setRegexpToSanitize(regexpToSanitize);
    saveSettingsDebounced();
  };

  const onMaxThoughtsInPromptInput = (event) => {
    console.log("onMaxThoughtsInPromptInput", event.target.value);
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 0) {
      return;
    }

    settings.max_thoughts_in_prompt = value;
    setMaxThoughtsInPrompt(value);
    saveSettingsDebounced();
  };

  const reloadCharacters = () => {
    console.log("reloadCharacters");
    const { characters } = getContext();
    console.log("reloadCharacters", characters);
    setCharacterList(characters);
  };

  const onExcludedCharactersChange = (event) => {
    console.log("onExcludedCharactersChange", event.target.selectedOptions);
    const excludedCharacters = Array.from(event.target.selectedOptions);
    settings.excluded_characters = excludedCharacters.map(
      (option) => option.value
    );
    setExcludedCharacters(settings.excluded_characters);
    saveSettingsDebounced();
  };

  const onPromptItemAdd = () => {
    console.log("onPromptItemAdd");
    const promptsCount = settings.thinking_prompts.length;
    const id =
      promptsCount > 0 ? settings.thinking_prompts[promptsCount - 1].id + 1 : 0;

    settings.thinking_prompts.push({ id: id, prompt: "" });
    setPrompts([...settings.thinking_prompts]);
    saveSettingsDebounced();
  };

  function onPromptItemInput(event) {
    console.log("onPromptItemInput", event);
    const id = Number(event.target.getAttribute("data-id"));

    const value = event.target.value;
    const changedPrompt = settings.thinking_prompts.find(
      (item) => item.id === id
    );
    changedPrompt.prompt = value;
    setPrompts([...settings.thinking_prompts]);
    saveSettingsDebounced();
  }

  function onPromptItemRemove(event) {
    console.log("onPromptItemRemove", event);
    const id = Number(event.target.getAttribute("data-id"));
    console.log("onPromptItemRemove", id);

    settings.thinking_prompts = settings.thinking_prompts.filter(
      (item) => item.id !== id
    );
    console.log(settings.thinking_prompts);
    setPrompts([...settings.thinking_prompts]);
    settings.thinking_prompts = [...settings.thinking_prompts];
    saveSettingsDebounced();
  }

  const unrepeatedCharacters = Array.from(
    characterList
      .reduce((map, item) => {
        map.set(item.name, item);
        return map;
      }, new Map())
      .values()
  );

  useEffect(() => {
    const loadSettings = () => {
      setPrompts(settings.thinking_prompts);
      setCharacterList(getContext().characters);
      setExcludedCharacters(settings.excluded_characters);
      setIsEnabled(settings.is_enabled);
      setIsThoughtsSpoilerOpen(settings.is_thoughts_spoiler_open);
      setIsThinkingPopupsEnabled(settings.is_thinking_popups_enabled);
      setRegexpToSanitize(settings.regexp_to_sanitize);
      setMaxThoughtsInPrompt(settings.max_thoughts_in_prompt);
    };

    eventSource.on(event_types.APP_READY, loadSettings);
    return () => {
      eventSource.removeListener(event_types.APP_READY, loadSettings);
    };
  }, []);

  return (
    <div className="inline-drawer-content">
      <div className="flex-container marginTopBot5">
        <label
          className="checkbox_label expander"
          htmlFor="stepthink_is_enabled"
        >
          <input
            id="stepthink_is_enabled"
            onChange={toggleEnabled}
            checked={isEnabled}
            type="checkbox"
          />
          Enable Stepped Thinking
        </label>
      </div>

      <hr />

      <div className="flex-container justifySpaceBetween flexFlowColumn">
        Prompts for thinking:
        <div
          id="stepthink_prompt_list_add"
          onClick={onPromptItemAdd}
          className="menu_button menu_button_icon fa-solid fa-plus"
          title="Add prompt"
        ></div>
        {prompts.map((prompt) => (
          <div
            className="flex-container marginTopBot5 adivgnItemsCenter"
            id={"stepthink_prompt_item--" + prompt.id}
            key={prompt.id}
          >
            <textarea
              id={"stepthink_prompt_text--" + prompt.id}
              value={prompt.prompt}
              className="text_pole textarea_compact"
              onInput={onPromptItemInput}
              rows="6"
              data-id={prompt.id}
            />
            <div
              id={"stepthink_prompt_remove--" + prompt.id}
              onClick={onPromptItemRemove}
              className="menu_button menu_button_icon fa-solid fa-trash redWarningBG"
              data-id={prompt.id}
              title="Remove prompt"
            />
          </div>
        ))}
      </div>

      <div id="stepthink_prompt_list"></div>

      <hr />

      <div className="flex-container marginTopBot5">
        <label
          className="checkbox_label expander"
          htmlFor="stepthink_is_thoughts_spoiler_open"
          title="Whether spoilers will be open or closed in new messages. It doesn't affect existing ones"
        >
          <input
            id="stepthink_is_thoughts_spoiler_open"
            onChange={toggleThoughtsSpoilerOpen}
            checked={isThoughtsSpoilerOpen}
            type="checkbox"
          />
          Thought spoilers are open by default
        </label>
      </div>

      <div className="flex-container marginTopBot5">
        <label
          className="checkbox_label expander"
          htmlFor="stepthink_is_thinking_popups_enabled"
          title="Whether popups notifying about the progress of thinking will be shown"
        >
          <input
            id="stepthink_is_thinking_popups_enabled"
            onChange={toggleThinkingPopupsEnabled}
            checked={isThinkingPopupsEnabled}
            type="checkbox"
          />
          Enable popups when a character is thinking
        </label>
      </div>

      <div className="flex-container marginTopBot5">
        <div
          className="flex-container flex1"
          title="The number of a character's last messages with thoughts that will be included in the generation prompt"
        >
          <label htmlFor="stepthink_max_thoughts_in_prompt">
            Number of included thoughts for a character:
          </label>
          <input
            type="number"
            onChange={onMaxThoughtsInPromptInput}
            value={maxThoughtsInPrompt}
            id="stepthink_max_thoughts_in_prompt"
            className="text_pole"
            min="0"
          />
        </div>
      </div>

      <div className="flex-container marginTopBot5">
        <div
          className="flex-container flex1"
          title="Often, there are special symbols and other shiza in the generation output; it will be removed by the regexp"
        >
          <label htmlFor="stepthink_regexp_to_sanitize">
            Regexp to sanitize thoughts:
          </label>
          <input
            type="text"
            onChange={onRegexpToSanitizeChanged}
            value={regexpToSanitize}
            id="stepthink_regexp_to_sanitize"
            className="text_pole textarea_compact"
          />
        </div>
      </div>

      <div className="flex-container justifySpaceBetween alignItemsCenter">
        <label
          htmlFor="stepthink_excluded_characters"
          title="Do you want to exclude your narrator or anyone else from the thinking process? This option is for you. Also, pay attention that characters are identified by their names"
        >
          Characters with disabled thinking:
        </label>
        <div
          id="stepthink_load_characters"
          onClick={reloadCharacters}
          className="menu_button menu_button_icon fa-solid fa-undo"
          title="Reload characters list"
        ></div>
        <select
          id="stepthink_excluded_characters"
          value={unrepeatedCharacters
            .map((character) => character.name)
            .filter((name) => excludedCharacters.includes(name))}
          onChange={onExcludedCharactersChange}
          className="select2_multi_sameline"
          multiple
        >
          {unrepeatedCharacters.map((character) => (
            <option key={character.name} value={character.name}>
              {character.name}
            </option>
          ))}
        </select>
      </div>

      <hr className="sysHR" />
    </div>
  );
};

export default ThinkingSettings;

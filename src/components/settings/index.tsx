import { useMemo, useState } from "react";
import { useExtensionSettings } from "@components/context/ExtensionSettingsContext";

const SettingsWrapper = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    arbiterPrompt,
    arbiterFrequency,
    defaultArbiterPrompt,
    setArbiterPrompt,
    setArbiterFrequency,
    resetArbiterPrompt,
  } = useExtensionSettings();

  const isPromptDefault = useMemo(() => arbiterPrompt === defaultArbiterPrompt, [arbiterPrompt, defaultArbiterPrompt]);
  console.log("[Story settings] Render", { arbiterPrompt, arbiterFrequency, isPromptDefault, isOpen });
  return (
    <div id="stepthink_settings">
      <div className="inline-drawer">
        <div
          className="inline-drawer-toggle inline-drawer-header flex items-center justify-between"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <b>Project Story</b>
          <div
            className={`inline-drawer-icon fa-solid fa-circle-chevron-${isOpen ? "down" : "up"} ${isOpen ? "down" : "up"}`}
          />
        </div>
        {isOpen && (
          <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="story-arbiter-frequency" className="text-sm font-medium">
                Arbiter Frequency (turns)
              </label>
              <input
                id="story-arbiter-frequency"
                type="number"
                min={1}
                max={99}
                className="text_pole"
                value={arbiterFrequency}
                onChange={(event) => {
                  const next = Number.parseInt(event.target.value, 10);
                  setArbiterFrequency(Number.isFinite(next) ? next : 1);
                }}
              />
              <p className="text-xs opacity-70">
                Runs interval evaluations after this many player turns when no triggers fire.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="story-arbiter-prompt" className="text-sm font-medium">
                Arbiter Prompt
              </label>
              <textarea
                id="story-arbiter-prompt"
                className="text_pole textarea_compact"
                rows={6}
                value={arbiterPrompt}
                onChange={(event) => setArbiterPrompt(event.target.value)}
              />
              <div className="flex items-center justify-between text-xs opacity-70">
                <span>Custom instructions prepended to Arbiter evaluations.</span>
                <button
                  type="button"
                  className="menu_button px-2 py-1"
                  onClick={resetArbiterPrompt}
                  disabled={isPromptDefault}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsWrapper;

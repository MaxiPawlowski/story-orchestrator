import type { InChatDivider } from "@runtime/inChatTypes";
import { IN_CHAT_COPY } from "@features/inChatCopy";
import "./inchat.css";

export interface SceneDividerProps {
  messageId: number;
  divider: InChatDivider;
}

export const dividerText = (divider: InChatDivider): string =>
  [divider.time, divider.scene ? IN_CHAT_COPY.newScene : null].filter(Boolean).join(" · ") || IN_CHAT_COPY.timeMoved;

export const SceneDivider = ({ messageId, divider }: SceneDividerProps) => {
  const text = dividerText(divider);
  return (
    <div data-so="in-chat-divider" data-mesid={messageId} data-scene={divider.scene || undefined} className="so-ic-divider" role="separator"
      aria-label={IN_CHAT_COPY.dividerLabel(text)}>
      <span className="so-ic-divider-rule" aria-hidden="true" />
      <span className="so-ic-divider-text">
        <i className={`fa-solid ${divider.time ? "fa-clock" : "fa-film"}`} aria-hidden="true" />
        <span>{text}</span>
      </span>
      <span className="so-ic-divider-rule" aria-hidden="true" />
    </div>
  );
};

export default SceneDivider;

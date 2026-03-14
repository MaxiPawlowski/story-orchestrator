import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { setActiveOrchestratorSession } from "@controllers/orchestratorManager";
import {
  createStoryOrchestratorSession,
  type StoryOrchestratorSession,
} from "@services/runtime/createStoryOrchestratorSession";
import {
  getChatSessionBridgeSnapshot,
  releaseChatSessionBridge,
  retainChatSessionBridge,
  subscribeToChatSessionBridge,
  type ChatSessionContextSnapshot,
} from "@controllers/chatSessionBridge";

interface StorySessionContextValue {
  session: StoryOrchestratorSession;
  activeChatId: string | null;
}

const StorySessionContext = createContext<StorySessionContextValue | undefined>(undefined);

export const StorySessionProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const sessionRef = useRef<ReturnType<typeof createStoryOrchestratorSession> | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = createStoryOrchestratorSession();
  }
  const session = sessionRef.current;
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    setActiveOrchestratorSession(session);
    return () => {
      if (sessionRef.current === session) {
        setActiveOrchestratorSession(null);
      }
    };
  }, [session]);

  useEffect(() => {
    const updateChatId = (chat: ChatSessionContextSnapshot = getChatSessionBridgeSnapshot().chat) => {
      setActiveChatId(chat.groupChatSelected ? chat.chatId : null);
    };

    retainChatSessionBridge();
    updateChatId();
    const off = subscribeToChatSessionBridge((event) => {
      if (event.type !== "chat") return;
      updateChatId(event.chat);
    });

    return () => {
      off();
      releaseChatSessionBridge();
    };
  }, []);

  return (
    <StorySessionContext.Provider value={{ session, activeChatId }}>
      {children}
    </StorySessionContext.Provider>
  );
};

const useStorySessionContext = (): StorySessionContextValue => {
  const value = useContext(StorySessionContext);
  if (!value) {
    throw new Error("StorySessionContext not available");
  }
  return value;
};

export const useStorySession = (): StoryOrchestratorSession => useStorySessionContext().session;

export const useStorySessionState = (): Pick<StorySessionContextValue, "activeChatId"> => {
  const { activeChatId } = useStorySessionContext();
  return { activeChatId };
};

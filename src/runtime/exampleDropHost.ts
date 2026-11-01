import { observeExampleDialogue, type ExampleDialogueRead } from "@services/STAPI";
import { exampleDropLedger, type ExampleDropLedger } from "./exampleDrop";

export interface ExampleDropWiring {
  chatId: () => string | null;
  ownedChat: () => string | null;
  playing: () => boolean;
  loud: () => boolean;
  notify: () => void;
  observe?: (handler: (read: ExampleDialogueRead) => void) => () => void;
  ledger?: ExampleDropLedger;
}

export function startExampleDrop(deps: ExampleDropWiring): () => void {
  const ledger = deps.ledger ?? exampleDropLedger;
  return (deps.observe ?? observeExampleDialogue)((read) => {
    const chatId = deps.chatId();
    if (chatId === null || chatId !== deps.ownedChat() || !deps.playing() || !deps.loud()) return;
    if (ledger.note(chatId, read)) deps.notify();
  });
}

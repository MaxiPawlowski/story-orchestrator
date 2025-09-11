// src/services/RoleCFGRouter.ts
import { eventSource, event_types, setChatCFGScale } from "@services/SillyTavernAPI";

/**
 * Keeps per-character CFG and switches the chat CFG to match the active speaker.
 * Best: pre-generation interceptor. Fallback: after assistant message (affects next turn).
 */
class RoleCFGRouter {
  private map = new Map<string, number>();
  private installed = false;

  constructor() {
    console.log("RoleCFGRouter initialized");
    setChatCFGScale(2.0); // default
  }

  setScale(characterName: string, scale: number) {
    this.map.set(characterName, Number(scale));
  }

  attach() {
    if (this.installed) return;
    this.installed = true;

    // // Best path: pre-generation hook (if available)
    // const ok = registerGenerateInterceptor?.((ctx) => {
    //   // ctx.speakerName or ctx.characterName – use whatever your build provides
    //   const name = ctx?.speakerName || ctx?.characterName || ctx?.char;
    //   if (name && this.map.has(name)) {
    //     setChatCFGScale(this.map.get(name));
    //   }
    //   return ctx;
    // });

    // if (ok) return;

    // Fallback: after each assistant message, set CFG for that speaker (affects next reply)
    eventSource.on?.(event_types.MESSAGE_RECEIVED, (msg: any) => {
      const name = msg?.name || msg?.sender || msg?.char;
      const assistant = msg && !msg.is_user;
      if (assistant && name && this.map.has(name)) {
        setChatCFGScale(this.map.get(name)!);
      }
    });
  }
}

export const roleCFGRouter = new RoleCFGRouter();

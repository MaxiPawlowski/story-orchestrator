import { setImmediate as nextTurn } from "timers";

export const settleTurns = async (turns: number): Promise<void> => {
  for (let index = 0; index < turns; index += 1) await new Promise<void>((resolve) => { nextTurn(resolve); });
};

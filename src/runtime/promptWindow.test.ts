import { messageProbe, oldestInWindow, PromptWindow } from "./promptWindow";

const row = (mes: string, extra: Record<string, unknown> = {}) => ({ mes, ...extra });
const chat = Array.from({ length: 10 }, (_, index) => row(`Message number ${index} says something long enough to probe.\nshort`));
const turn = (text: string) => `<|turn>model\n${text}<turn|>\n`;
const prompt = (from: number) => `<|turn>system\nCard text<turn|>\n${chat.slice(from).map((entry) => turn(entry.mes)).join("")}`;

describe("43 C: the oldest chat message SillyTavern kept in the prompt", () => {
  it("finds the trim point and the whole chat", () => {
    expect(oldestInWindow(prompt(0), chat)).toBe(0);
    expect(oldestInWindow(prompt(4), chat)).toBe(4);
  });

  it("skips hidden and too-short messages, and answers null when the newest message is not found", () => {
    const rows = [...chat.slice(0, 3), row("ok"), row("Hidden system note that never reaches the prompt at all.", { is_system: true }), ...chat.slice(3)];
    expect(oldestInWindow(prompt(0), rows)).toBe(0);
    expect(oldestInWindow("nothing here", chat)).toBeNull();
    expect(messageProbe(row("tiny"))).toBeNull();
  });

  it("probes whitespace-insensitively", () => {
    expect(oldestInWindow(prompt(0).replace(/ says /g, "  says\n"), chat)).toBe(0);
  });

  it("the tracker forgets on reset", () => {
    const window = new PromptWindow();
    window.observe(3);
    expect(window.from()).toBe(3);
    window.reset();
    expect(window.from()).toBeNull();
  });
});

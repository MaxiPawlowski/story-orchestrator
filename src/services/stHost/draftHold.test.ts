import { draftHold, type DraftBox } from "./draftHold";

class FakeBox implements DraftBox {
  value = "";
  readOnly = false;
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;
  private listeners: Array<(event: Event) => void> = [];
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  dispatchEvent(event: Event) {
    [...this.listeners].forEach((listener) => listener(event));
    return true;
  }
  addEventListener(_type: "input", listener: (event: Event) => void) { this.listeners.push(listener); }
  removeEventListener(_type: "input", listener: (event: Event) => void) { this.listeners = this.listeners.filter((entry) => entry !== listener); }
  type(text: string) {
    if (this.readOnly) return;
    this.value += text;
    this.setSelectionRange(this.value.length, this.value.length);
  }
  listenerCount() { return this.listeners.length; }
}

type Phase = "preamble" | "ping" | "stream";
type Guard = ReturnType<typeof draftHold>;
const NO_BOX_READ = ["regenerate", "swipe", "quiet", "impersonate"];
const tick = () => Promise.resolve();

const fakeSt = (useGuard: boolean, active = true) => {
  const box = new FakeBox();
  const guard: Guard | null = useGuard ? draftHold({ box: () => box, active: () => active }) : null;
  const st = { posted: [] as string[], commands: [] as string[], reads: [] as string[] };
  const hooks: Array<{ member: number; phase: Phase; run: () => void }> = [];
  const at = (member: number, phase: Phase, run: () => void) => hooks.push({ member, phase, run });
  const fire = (member: number, phase: Phase) => hooks.filter((hook) => hook.member === member && hook.phase === phase).forEach((hook) => hook.run());
  const generate = async (member: number, type: string, params: Record<string, unknown>, skipRead = false) => {
    await tick();
    guard?.generationStarted(type, params, false);
    if (!["regenerate", "swipe", "quiet"].includes(type) && box.value.trim().startsWith("/")) {
      st.commands.push(box.value);
      box.value = "";
      return;
    }
    fire(member, "ping");
    await tick();
    if (skipRead) return;
    if (!NO_BOX_READ.includes(type)) {
      const text = box.value;
      box.value = "";
      box.dispatchEvent(new Event("input", { bubbles: true }));
      st.reads.push(text);
      if (text !== "" && !params.automatic_trigger) st.posted.push(text);
    }
    fire(member, "stream");
    await tick();
  };
  const wrapper = async (members: number, type = "normal", params: Record<string, unknown> = {}, skipRead: number[] = []) => {
    await tick();
    guard?.wrapperStarted();
    try {
      for (let member = 1; member <= members; member += 1) {
        guard?.memberDrafted();
        fire(member, "preamble");
        await generate(member, type, params, skipRead.includes(member));
      }
    } finally {
      guard?.wrapperFinished();
    }
  };
  return { box, guard, st, at, wrapper, generate };
};

describe("draft guard (v3.0 19 defect 1: a draft typed during the player's own group wrapper was posted by the next member's Generate)", () => {
  it("control: without the guard, the second activated member's Generate posts the draft typed while the first voice streamed", async () => {
    const host = fakeSt(false);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("still typing"));
    await host.wrapper(2);
    expect(host.st.posted).toEqual(["hello", "still typing"]);
    expect(host.box.value).toBe("");
  });

  it("the player's send posts once and the draft stays in the box, untouched by the later members", async () => {
    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("still typing"));
    await host.wrapper(3);
    expect(host.st.posted).toEqual(["hello"]);
    expect(host.st.reads).toEqual(["hello", "", ""]);
    expect(host.box.value).toBe("still typing");
    expect(host.box.readOnly).toBe(false);
    expect(host.box.listenerCount()).toBe(0);
    expect(host.guard?.holding()).toBe(false);
  });

  it("a slash-command draft is not run by a later member's command pass", async () => {
    const control = fakeSt(false);
    control.box.value = "hello";
    control.at(1, "stream", () => control.box.type("/roll 2d6"));
    await control.wrapper(2);
    expect(control.st.commands).toEqual(["/roll 2d6"]);

    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("/roll 2d6"));
    await host.wrapper(2);
    expect(host.st.commands).toEqual([]);
    expect(host.box.value).toBe("/roll 2d6");
  });

  it("keystrokes between the hold and ST's read are refused by the read-only box instead of being posted", async () => {
    const control = fakeSt(false);
    control.box.value = "hello";
    control.at(2, "ping", () => control.box.type("x"));
    await control.wrapper(2);
    expect(control.st.posted).toEqual(["hello", "x"]);

    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("draft"));
    host.at(2, "ping", () => host.box.type("x"));
    await host.wrapper(2);
    expect(host.st.posted).toEqual(["hello"]);
    expect(host.box.value).toBe("draft");
  });

  it("the draft comes back right at ST's clear, so the player keeps typing while the member streams", async () => {
    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("draft"));
    host.at(2, "stream", () => host.box.type(" more"));
    await host.wrapper(2);
    expect(host.st.posted).toEqual(["hello"]);
    expect(host.box.value).toBe("draft more");
  });

  it("puts the caret back where the player left it", async () => {
    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => {
      host.box.type("abcdef");
      host.box.setSelectionRange(2, 4);
    });
    await host.wrapper(2);
    expect(host.box.value).toBe("abcdef");
    expect([host.box.selectionStart, host.box.selectionEnd]).toEqual([2, 4]);
  });

  it("a forced wrapper (a chained voice or NPC line) never takes the box, even when a draft was typed before it began", async () => {
    const control = fakeSt(false);
    control.box.value = "typed late";
    await control.wrapper(1, "normal", { force_chid: 3 });
    expect(control.st.posted).toEqual(["typed late"]);

    const host = fakeSt(true);
    host.box.value = "typed late";
    await host.wrapper(1, "normal", { force_chid: 3 });
    expect(host.st.posted).toEqual([]);
    expect(host.box.value).toBe("typed late");
  });

  it("an automatic wrapper does not clear the draft away", async () => {
    const control = fakeSt(false);
    control.box.value = "draft";
    await control.wrapper(1, "normal", { automatic_trigger: true });
    expect(control.box.value).toBe("");

    const host = fakeSt(true);
    host.box.value = "draft";
    await host.wrapper(1, "normal", { automatic_trigger: true });
    expect(host.box.value).toBe("draft");
  });

  it("a wrapper begun with an empty box (an empty send) holds anything typed after it began", async () => {
    const host = fakeSt(true);
    host.at(1, "preamble", () => host.box.type("typed late"));
    await host.wrapper(1);
    expect(host.st.posted).toEqual([]);
    expect(host.box.value).toBe("typed late");
  });

  it("a member call that returns before reading the box gives the draft back at the next member or at the wrapper's end", async () => {
    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("draft"));
    let between = "";
    host.at(3, "preamble", () => { between = host.box.value; });
    await host.wrapper(3, "normal", {}, [2]);
    expect(between).toBe("draft");
    expect(host.st.posted).toEqual(["hello"]);
    expect(host.box.value).toBe("draft");

    const last = fakeSt(true);
    last.box.value = "hello";
    last.at(1, "stream", () => last.box.type("draft"));
    await last.wrapper(2, "normal", {}, [2]);
    expect(last.box.value).toBe("draft");
    expect(last.box.readOnly).toBe(false);
  });

  it("a stop or a chat change while held gives the draft back at once", async () => {
    const host = fakeSt(true);
    host.box.value = "hello";
    host.at(1, "stream", () => host.box.type("draft"));
    let during = "";
    let after = "";
    host.at(2, "ping", () => {
      during = host.box.value;
      host.guard?.interrupted();
      after = host.box.value;
    });
    await host.wrapper(2, "normal", {}, [2]);
    expect(during).toBe("");
    expect(after).toBe("draft");
    expect(host.box.readOnly).toBe(false);
    expect(host.st.posted).toEqual(["hello"]);
  });

  it("swipe, regenerate, quiet, impersonate and dry runs never hold (they do not read the box)", async () => {
    for (const type of NO_BOX_READ) {
      const host = fakeSt(true);
      host.box.value = "draft";
      await host.wrapper(2, type);
      expect({ type, value: host.box.value, posted: host.st.posted }).toEqual({ type, value: "draft", posted: [] });
    }
    const dry = fakeSt(true);
    dry.box.value = "hello";
    dry.guard?.wrapperStarted();
    dry.guard?.generationStarted("normal", {}, true);
    dry.guard?.generationStarted("normal", {}, true);
    expect(dry.guard?.holding()).toBe(false);
    dry.guard?.generationStarted("normal", {}, false);
    expect(dry.guard?.holding()).toBe(false);
    dry.guard?.generationStarted("normal", {}, false);
    expect(dry.guard?.holding()).toBe(true);
  });

  it("does nothing outside a group wrapper or while the runtime is inactive", async () => {
    const solo = fakeSt(true);
    solo.box.value = "hello";
    await solo.generate(1, "normal", {});
    expect(solo.st.posted).toEqual(["hello"]);

    const inactive = fakeSt(true, false);
    inactive.box.value = "hello";
    inactive.at(1, "stream", () => inactive.box.type("draft"));
    await inactive.wrapper(2);
    expect(inactive.st.posted).toEqual(["hello", "draft"]);
  });
});

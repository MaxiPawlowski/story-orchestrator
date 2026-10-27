export interface DraftBox {
  value: string;
  readOnly: boolean;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  setSelectionRange(start: number, end: number): void;
  dispatchEvent(event: Event): boolean;
  addEventListener(type: "input", listener: (event: Event) => void): void;
  removeEventListener(type: "input", listener: (event: Event) => void): void;
}

export interface DraftHoldDeps {
  box: () => DraftBox | null;
  active: () => boolean;
}

interface Wrapper {
  startText: string;
  reads: number;
}

interface Held {
  box: DraftBox;
  text: string;
  start: number | null;
  end: number | null;
  readOnly: boolean;
  onInput: (event: Event) => void;
}

export const NO_BOX_READ_TYPES = ["regenerate", "swipe", "quiet", "impersonate"];

const ownsBox = (wrapper: Wrapper, params: Record<string, unknown> | undefined): boolean =>
  wrapper.reads === 0 && wrapper.startText !== "" && !params?.automatic_trigger && typeof params?.force_chid !== "number";

export const draftHold = (deps: DraftHoldDeps) => {
  let wrapper: Wrapper | null = null;
  let held: Held | null = null;

  const release = (): boolean => {
    const current = held;
    if (!current) return false;
    held = null;
    const { box } = current;
    box.removeEventListener("input", current.onInput);
    box.value = box.value === "" ? current.text : current.text + box.value;
    box.readOnly = current.readOnly;
    if (current.text !== "" && current.start !== null && current.end !== null) {
      box.setSelectionRange(Math.min(current.start, box.value.length), Math.min(current.end, box.value.length));
    }
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };

  const hold = (box: DraftBox) => {
    const onInput = (event: Event) => {
      if (!event.isTrusted && box.value === "") release();
    };
    held = { box, text: box.value, start: box.selectionStart, end: box.selectionEnd, readOnly: box.readOnly, onInput };
    box.value = "";
    box.readOnly = true;
    box.addEventListener("input", onInput);
  };

  return {
    wrapperStarted: () => {
      release();
      const box = deps.box();
      wrapper = deps.active() && box ? { startText: box.value, reads: 0 } : null;
    },
    generationStarted: (type: unknown, params: Record<string, unknown> | undefined, dryRun: unknown) => {
      release();
      if (!wrapper || dryRun === true) return;
      if (NO_BOX_READ_TYPES.includes(typeof type === "string" ? type : "normal")) return;
      const owned = ownsBox(wrapper, params);
      wrapper.reads += 1;
      const box = deps.box();
      if (owned || !box) return;
      hold(box);
    },
    memberDrafted: () => { release(); },
    wrapperFinished: () => {
      release();
      wrapper = null;
    },
    interrupted: () => { release(); },
    holding: (): boolean => held !== null,
    release,
  };
};

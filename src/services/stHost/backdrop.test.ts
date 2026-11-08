import {
  BACKDROP_ROOT_ID, backdropReducedMotion, chatColumnRect, mountBackdropRoot, onPageVisibility, pageHidden, readBackdropStill, setBackdropFlags, unmountBackdropRoot,
  watchBackdropStill,
} from "./backdrop";

interface Node { id: string; attributes: Record<string, string>; style: Record<string, string>; parentElement: object | null; remove(): void; insertAdjacentElement(where: string, node: Node): void }

const page = (options: { background?: string; reduced?: boolean; hidden?: boolean } = {}) => {
  const nodes = new Map<string, Node>();
  const listeners = new Set<() => void>();
  const node = (id: string): Node => ({
    id, attributes: {}, style: {}, parentElement: {},
    remove() { nodes.delete(this.id); },
    insertAdjacentElement(_where, next) { nodes.set(next.id, next); },
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
  } as Node);
  const bg = node("bg1");
  bg.style.backgroundImage = options.background ?? "";
  nodes.set("bg1", bg);
  nodes.set("sheld", { ...node("sheld"), getBoundingClientRect: () => ({ left: 560, right: 1360, width: 800 }) } as Node);
  const dataset: Record<string, string> = {};
  Object.assign(globalThis, {
    document: {
      visibilityState: options.hidden ? "hidden" : "visible",
      documentElement: { dataset },
      body: { classList: { contains: (name: string) => name === "reduced-motion" && options.reduced === true } },
      getElementById: (id: string) => nodes.get(id) ?? null,
      createElement: () => node(""),
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    },
    getComputedStyle: () => ({ backgroundImage: options.background ?? "none", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", filter: "none" }),
  });
  return { nodes, dataset, listeners };
};

afterEach(() => { Reflect.deleteProperty(globalThis, "document"); Reflect.deleteProperty(globalThis, "getComputedStyle"); });

describe("v3.0 45 stHost backdrop", () => {
  it("mounts one root after #bg1 and removes it", () => {
    const { nodes } = page();
    const first = mountBackdropRoot();
    const second = mountBackdropRoot();
    expect(first.ok && second.ok && first.element === second.element).toBe(true);
    expect(nodes.has(BACKDROP_ROOT_ID)).toBe(true);
    expect(unmountBackdropRoot()).toEqual({ ok: true });
    expect(nodes.has(BACKDROP_ROOT_ID)).toBe(false);
  });

  it("refuses without #bg1", () => {
    const { nodes } = page();
    nodes.delete("bg1");
    expect(mountBackdropRoot()).toEqual({ ok: false, reason: expect.stringContaining("#bg1") });
  });

  it("sets the dim flag only while active", () => {
    const { dataset } = page();
    setBackdropFlags({ active: true, dim: true });
    expect(dataset).toEqual({ soBackdrop: "", soBackdropDim: "" });
    setBackdropFlags({ active: false, dim: true });
    expect(dataset).toEqual({});
  });

  it("reads the still, the chat column, reduced motion and visibility", () => {
    const { listeners } = page({ background: 'url("backgrounds/cellar.png")', reduced: true, hidden: true });
    expect(readBackdropStill()).toEqual({ url: "backgrounds/cellar.png", key: "cellar.png" });
    expect(chatColumnRect()).toEqual({ left: 560, right: 1360 });
    expect(backdropReducedMotion()).toBe(true);
    expect(pageHidden()).toBe(true);
    const stop = onPageVisibility(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
    expect(typeof watchBackdropStill(() => undefined)).toBe("function");
  });
});

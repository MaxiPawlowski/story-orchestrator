import { createElement, Suspense, type ComponentType, type ReactElement } from "react";
import { lazyRetry, resetFailedLazies } from "./lazyRetry";

type StaticDom = {
  prerenderToNodeStream: (element: ReactElement, options: { onError: (error: unknown) => void }) => Promise<{ prelude: AsyncIterable<unknown> }>;
};
const { prerenderToNodeStream } = jest.requireActual<StaticDom>("react-dom/static");

const render = async (component: ComponentType): Promise<string> => {
  const errors: unknown[] = [];
  const { prelude } = await prerenderToNodeStream(createElement(Suspense, { fallback: "loading" }, createElement(component)), { onError: (error) => { errors.push(error); } });
  let html = "";
  for await (const chunk of prelude) html += String(chunk);
  return errors.length ? `error:${html}` : html;
};

describe("CR-U 8: a lazy chunk that failed loads again after a retry", () => {
  it("re-runs the factory only after resetFailedLazies, and then renders", async () => {
    let calls = 0;
    const Loaded = () => createElement("span", null, "loaded");
    const Component = lazyRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error("chunk");
      return { default: Loaded };
    });
    expect(await render(Component)).toMatch(/^error:/);
    expect(await render(Component)).toMatch(/^error:/);
    expect(calls).toBe(1);
    expect(resetFailedLazies()).toBe(1);
    expect(await render(Component)).toContain("loaded");
    expect(calls).toBe(2);
    expect(resetFailedLazies()).toBe(0);
  });
});

export interface FakeNode {
  tag: string | null;
  children: FakeNode[];
  attributes: Record<string, string>;
  readonly textContent: string;
}

export interface FakeDocument {
  doc: Document;
  created: string[];
  markupWrites: string[];
}

export const fakeDocument = (): FakeDocument => {
  const created: string[] = [];
  const markupWrites: string[] = [];
  const text = (value: string): FakeNode => ({ tag: null, children: [], attributes: {}, get textContent() { return value; } });
  const element = (tag: string): FakeNode & Record<string, unknown> => {
    created.push(tag);
    const node = {
      tag,
      children: [] as FakeNode[],
      attributes: {} as Record<string, string>,
      className: "",
      ownText: "",
      append(...kids: FakeNode[]) { node.children.push(...kids); },
      setAttribute(name: string, value: string) { node.attributes[name] = value; },
      get textContent(): string { return node.ownText + node.children.map((child) => child.textContent).join(""); },
      set textContent(value: string) { node.ownText = value; node.children = []; },
      set innerHTML(value: string) { markupWrites.push(value); },
      closest: () => null,
    };
    return node;
  };
  const doc = { createElement: element, createTextNode: text };
  return { doc: doc as unknown as Document, created, markupWrites };
};

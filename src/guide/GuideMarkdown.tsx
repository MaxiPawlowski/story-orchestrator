import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline, type ListBlock } from "./markdown";
import { resolveLink, slugger } from "./links";
import type { GuideTarget } from "./types";

export interface GuideMarkdownProps {
  doc: string;
  body: string;
  homePage: string;
  onNavigate: (target: GuideTarget) => void;
}

export const headingDomId = (slug: string) => `so-guide-h-${slug}`;

const HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6", "h6"] as const;

export function GuideMarkdown({ doc, body, homePage, onNavigate }: GuideMarkdownProps) {
  const slug = slugger();

  const inline = (nodes: Inline[], key = "i"): ReactNode[] => nodes.map((node, index) => {
    const id = `${key}-${index}`;
    switch (node.kind) {
      case "text": return node.text;
      case "code": return <code key={id} className="so-guide-code">{node.text}</code>;
      case "strong": return <strong key={id}>{inline(node.children, id)}</strong>;
      case "em": return <em key={id}>{inline(node.children, id)}</em>;
      case "link": {
        const link = resolveLink(doc, node.href, homePage);
        if (link.kind === "external") return <a key={id} href={link.url} target="_blank" rel="noreferrer" className="underline">{inline(node.children, id)}</a>;
        if (link.kind === "page") {
          const { target } = link;
          return (
            <a key={id} href="#" data-so="guide-link" data-target={target.id} className="underline"
              onClick={(event) => { event.preventDefault(); onNavigate(target); }}>
              {inline(node.children, id)}
            </a>
          );
        }
        return <span key={id}>{inline(node.children, id)}</span>;
      }
      default: return null;
    }
  });

  const list = (block: ListBlock, key: string): ReactNode => {
    const items = block.items.map((item, index) => (
      <li key={index}>{inline(item.children, `${key}-${index}`)}{item.sub && list(item.sub, `${key}-${index}-s`)}</li>
    ));
    return block.ordered ? <ol key={key} className="list-decimal pl-5">{items}</ol> : <ul key={key} className="list-disc pl-5">{items}</ul>;
  };

  const render = (block: Block, index: number): ReactNode => {
    const key = `b${index}`;
    switch (block.kind) {
      case "heading": {
        const Tag = HEADING_TAGS[Math.min(block.level, 6) - 1];
        const id = headingDomId(slug(block.text));
        return <Tag key={key} id={id} data-so="guide-heading" className="so-guide-heading font-semibold">{inline(block.children, key)}</Tag>;
      }
      case "paragraph": return <p key={key}>{inline(block.children, key)}</p>;
      case "code": return <pre key={key} className="so-guide-pre"><code>{block.text}</code></pre>;
      case "quote": return <blockquote key={key} className="so-guide-quote">{inline(block.children, key)}</blockquote>;
      case "rule": return <hr key={key} />;
      case "table": return (
        <div key={key} className="so-guide-table-wrap">
          <table className="so-guide-table">
            <thead><tr>{block.head.map((cell, at) => <th key={at}>{inline(cell, `${key}-h${at}`)}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, at) => <tr key={at}>{row.map((cell, col) => <td key={col}>{inline(cell, `${key}-${at}-${col}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      case "list": return list(block, key);
      default: return null;
    }
  };

  return <div data-so="guide-page" data-doc={doc} className="so-guide-body flex flex-col gap-2">{parseMarkdown(body).map(render)}</div>;
}

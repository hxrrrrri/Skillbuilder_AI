"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseMarkdown, type Block, type InlineNode, type ListItem } from "@/lib/copilot/markdown";

// Premium LLM-style renderer for assistant messages.
//
// Security: never uses dangerouslySetInnerHTML. The content is parsed into a safe
// token tree (see @/lib/copilot/markdown) and mapped to React elements, so any raw
// HTML in the source is escaped by React. Links are restricted to internal routes
// and http(s)/mailto by the parser; unsafe protocols degrade to plain text.

function renderInline(nodes: InlineNode[], keyPrefix: string): ReactNode {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "text":
        return <span key={key}>{node.value}</span>;
      case "code":
        return (
          <code key={key} className="rounded bg-panel2/80 px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
            {node.value}
          </code>
        );
      case "strong":
        return (
          <strong key={key} className="font-semibold text-ink">
            {renderInline(node.children, key)}
          </strong>
        );
      case "em":
        return (
          <em key={key} className="italic">
            {renderInline(node.children, key)}
          </em>
        );
      case "strike":
        return (
          <s key={key} className="text-ink/60 line-through">
            {renderInline(node.children, key)}
          </s>
        );
      case "footnote_ref":
        return (
          <sup key={key} className="ml-0.5">
            <a
              id={`fnref-${node.id}`}
              href={`#fn-${node.id}`}
              className="rounded px-0.5 font-mono text-[0.7em] text-accent no-underline hover:underline"
              aria-label={`Footnote ${node.index}`}
            >
              [{node.index}]
            </a>
          </sup>
        );
      case "link":
        if (node.route) {
          return (
            <a
              key={key}
              href={node.href}
              className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[0.8em] text-accent no-underline transition hover:border-accent/70 hover:bg-accent/15"
            >
              <span aria-hidden>↗</span>
              {renderInline(node.children, key)}
            </a>
          );
        }
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}

const HEADING_CLASSES: Record<number, string> = {
  1: "mt-1 text-base font-semibold text-ink",
  2: "mt-3 text-[13px] font-semibold uppercase tracking-wide text-accent/90",
  3: "mt-3 text-[12px] font-semibold uppercase tracking-wide text-muted",
  4: "mt-2 text-[12px] font-semibold text-ink",
  5: "mt-2 text-[12px] font-semibold text-ink",
  6: "mt-2 text-[12px] font-semibold text-ink",
};

function alignClass(a: "left" | "right" | "center" | null): string {
  if (a === "right") return "text-right";
  if (a === "center") return "text-center";
  return "text-left";
}

/** Render an item's nested blocks. A lone paragraph renders inline (tight list);
 *  anything richer (sub-lists, multiple paragraphs, code) renders as full blocks. */
function renderItemContent(item: ListItem, key: string): ReactNode {
  if (item.blocks.length === 1 && item.blocks[0].type === "paragraph") {
    return renderInline(item.blocks[0].children, key);
  }
  return <div className="space-y-1">{item.blocks.map((b, k) => renderBlock(b, `${key}-${k}`))}</div>;
}

function TaskBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded border text-[9px] leading-none",
        checked ? "border-accent bg-accent/20 text-accent" : "border-border bg-panel2/40 text-transparent",
      )}
    >
      ✓
    </span>
  );
}

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.type) {
    case "heading": {
      const cls = HEADING_CLASSES[block.level] ?? HEADING_CLASSES[3];
      if (block.level <= 1) return <h3 key={key} className={cls}>{renderInline(block.children, key)}</h3>;
      if (block.level === 2) return <h4 key={key} className={cls}>{renderInline(block.children, key)}</h4>;
      return <h5 key={key} className={cls}>{renderInline(block.children, key)}</h5>;
    }
    case "paragraph":
      return (
        <p key={key} className="text-[13px] leading-relaxed text-ink/90">
          {renderInline(block.children, key)}
        </p>
      );
    case "bullet_list":
      return (
        <ul key={key} className="ml-1 space-y-1">
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink/90">
              {item.checked === null ? (
                <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent/60" />
              ) : (
                <TaskBox checked={item.checked} />
              )}
              <div className="min-w-0 flex-1">{renderItemContent(item, `${key}-${j}`)}</div>
            </li>
          ))}
        </ul>
      );
    case "ordered_list":
      return (
        <ol key={key} start={block.start} className="ml-1 space-y-1">
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink/90">
              <span aria-hidden className="mt-0.5 min-w-[1.1rem] font-mono text-[11px] text-accent/80">
                {block.start + j}.
              </span>
              <div className="min-w-0 flex-1">{renderItemContent(item, `${key}-${j}`)}</div>
            </li>
          ))}
        </ol>
      );
    case "code_block":
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-lg border border-border bg-bg/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink/90"
        >
          <code>{block.value}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="space-y-1 rounded-r-lg border-l-2 border-accent/50 bg-accent/5 px-3 py-2 text-[13px] leading-relaxed text-ink/85"
        >
          {block.blocks.map((b, j) => renderBlock(b, `${key}-${j}`))}
        </blockquote>
      );
    case "table":
      return (
        <div key={key} className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="bg-panel2/70">
              <tr>
                {block.headers.map((cell, j) => (
                  <th
                    key={`${key}-h-${j}`}
                    className={cn("whitespace-nowrap px-3 py-2 font-semibold text-muted", alignClass(block.align[j] ?? null))}
                  >
                    {renderInline(cell, `${key}-h-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {block.rows.map((row, r) => (
                <tr key={`${key}-r-${r}`} className="transition hover:bg-panel2/30">
                  {row.map((cell, c) => (
                    <td
                      key={`${key}-r-${r}-${c}`}
                      className={cn("px-3 py-1.5 align-top text-ink/90", alignClass(block.align[c] ?? null))}
                    >
                      {renderInline(cell, `${key}-r-${r}-${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "footnotes":
      return (
        <section key={key} className="mt-3 border-t border-border/70 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Footnotes</p>
          <ol className="space-y-1">
            {block.items.map((fn) => (
              <li key={fn.id} id={`fn-${fn.id}`} className="flex items-start gap-2 text-[12px] leading-relaxed text-ink/80">
                <span aria-hidden className="min-w-[1.1rem] font-mono text-[11px] text-accent/80">
                  {fn.index}.
                </span>
                <span className="min-w-0 flex-1">
                  {renderInline(fn.children, `${key}-${fn.id}`)}{" "}
                  <a href={`#fnref-${fn.id}`} className="text-accent no-underline hover:underline" aria-label="Back to reference">
                    ↩
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </section>
      );
    case "hr":
      return <hr key={key} className="border-border/70" />;
  }
}

/** Pure block renderer — no hooks, safe to render server-side (used by tests). */
export function MarkdownBlocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((block, i) => renderBlock(block, `b-${i}`))}</>;
}

export function MarkdownMessage({
  content,
  citations,
  providerId,
  model,
  className,
}: {
  content: string;
  citations?: string[];
  providerId?: string;
  model?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const blocks = parseMarkdown(content);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className={cn("group/msg space-y-2", className)}>
      <div className="space-y-2">
        <MarkdownBlocks blocks={blocks} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={copy}
          className="rounded border border-border bg-panel2/50 px-2 py-0.5 text-[10px] text-muted opacity-0 transition hover:border-accent/60 hover:text-ink group-hover/msg:opacity-100"
          aria-label="Copy response"
        >
          {copied ? "✓ copied" : "Copy"}
        </button>
        {(providerId || model) && (
          <span className="text-[10px] text-muted">
            {providerId}
            {providerId && model ? " · " : ""}
            {model}
          </span>
        )}
      </div>

      {citations && citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted">Sources</span>
          {citations.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-panel2/60 px-2 py-0.5 font-mono text-[10px] text-muted"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

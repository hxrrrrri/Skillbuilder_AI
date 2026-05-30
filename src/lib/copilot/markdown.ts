// Safe, dependency-free markdown parser for assistant messages.
//
// Why hand-rolled instead of react-markdown:
// - No `dangerouslySetInnerHTML` anywhere — the renderer maps this token tree to
//   React elements, so any raw HTML in the source is rendered as literal text by
//   React's automatic escaping. There is no HTML sink.
// - No new runtime dependency / bundle weight, and `parseMarkdown` is a pure
//   function so it is fully unit-testable in a node environment.
//
// Supported block grammar: ATX headings, paragraphs, GFM pipe tables, fenced +
// inline code, blockquotes/callouts (with nested blocks), horizontal rules, and
// **arbitrarily nested** bullet/ordered lists including GFM task-list items
// (`- [x]`). Inline: bold, italic, strikethrough, inline code, safe links
// (route + http(s)/mailto only), and footnote references (`[^id]`) resolved
// against `[^id]:` definitions into a numbered footnotes section. Unknown/unsafe
// link protocols degrade to text.

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; href: string; route: boolean; children: InlineNode[] }
  | { type: "footnote_ref"; id: string; index: number };

/** A list entry. `blocks` is the item's nested content (paragraph + optional
 *  sub-lists / quotes / code), enabling unlimited nesting. `checked` is the
 *  GFM task-list state, or null when the item is not a task. */
export type ListItem = { blocks: Block[]; checked: boolean | null };

export type FootnoteItem = { id: string; index: number; children: InlineNode[] };

export type Block =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "bullet_list"; start: number; items: ListItem[] }
  | { type: "ordered_list"; start: number; items: ListItem[] }
  | { type: "code_block"; lang: string | null; value: string }
  | { type: "blockquote"; blocks: Block[] }
  | { type: "table"; align: Array<"left" | "right" | "center" | null>; headers: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "footnotes"; items: FootnoteItem[] }
  | { type: "hr" };

/** True for hrefs we are willing to render as a real anchor. Everything else degrades to text. */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  if (h.startsWith("/") && !h.startsWith("//")) return true; // internal route
  if (h.startsWith("#")) return true; // in-page anchor
  return /^(https?:\/\/|mailto:)/i.test(h);
}

export function isRouteHref(href: string): boolean {
  const h = href.trim();
  return h.startsWith("/") && !h.startsWith("//");
}

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  // Protect escaped pipes, split on |, restore.
  const protectedLine = line.replace(/\\\|/g, " ");
  let cells = protectedLine.split("|");
  // Drop the leading/trailing empty cells produced by surrounding pipes.
  if (cells.length && cells[0].trim() === "") cells = cells.slice(1);
  if (cells.length && cells[cells.length - 1].trim() === "") cells = cells.slice(0, -1);
  return cells.map((c) => c.replace(/ /g, "|").trim());
}

function parseAlign(sep: string): Array<"left" | "right" | "center" | null> {
  return splitTableRow(sep).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

// ── indentation helpers (tabs count as 4 columns) ────────────────────────────

function indentWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === " ") w += 1;
    else if (ch === "\t") w += 4;
    else break;
  }
  return w;
}

/** Remove up to `n` columns of leading whitespace. */
function dedent(line: string, n: number): string {
  let removed = 0;
  let idx = 0;
  while (idx < line.length && removed < n) {
    const ch = line[idx];
    if (ch === " ") removed += 1;
    else if (ch === "\t") removed += 4;
    else break;
    idx += 1;
  }
  return line.slice(idx);
}

type ListMarker = { indent: number; ordered: boolean; start: number; content: string };

function listMarker(line: string): ListMarker | null {
  const bullet = line.match(/^(\s*)([-*+])(\s+)(.*)$/);
  if (bullet) return { indent: indentWidth(line), ordered: false, start: 1, content: bullet[4] };
  const ordered = line.match(/^(\s*)(\d+)[.)](\s+)(.*)$/);
  if (ordered) return { indent: indentWidth(line), ordered: true, start: Number(ordered[2]) || 1, content: ordered[4] };
  return null;
}

// ── block parser ─────────────────────────────────────────────────────────────

export function parseMarkdown(input: string): Block[] {
  const lines = (input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const { content, defs } = extractFootnoteDefs(lines);
  let blocks = parseBlocks(content);

  // Always resolve: defined refs get a number, undefined refs degrade to text.
  const state: FootnoteState = { defs, order: new Map(), counter: 0 };
  // Number footnotes by first reference in the body (CommonMark/GFM convention).
  assignBlockIndices(blocks, state);
  let items = buildFootnoteItems(state);
  // Pick up footnote refs that themselves live inside a definition's text.
  items.forEach((it) => assignInlineIndices(it.children, state));
  items = buildFootnoteItems(state);
  blocks = blocks.map((b) => resolveBlock(b, state));
  items = items.map((it) => ({ ...it, children: resolveInline(it.children, state) }));
  if (items.length) blocks.push({ type: "footnotes", items });

  return blocks;
}

/** Parse a dedented array of lines into blocks. Recursive (lists, blockquotes). */
function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      const lang = fence[1].trim() || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      blocks.push({ type: "code_block", lang, value: body.join("\n") });
      continue;
    }

    // Horizontal rule (checked before lists so `***`/`---` are not read as markers).
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading.
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, children: parseInline(heading[2].trim()) });
      i++;
      continue;
    }

    // GFM table: header row + separator row.
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const headers = splitTableRow(line).map(parseInline);
      const align = parseAlign(lines[i + 1]);
      i += 2;
      const rows: InlineNode[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", align, headers, rows });
      continue;
    }

    // Blockquote / callout — strip one `>` level and parse the inner content as blocks.
    if (/^\s*>\s?/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        inner.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", blocks: parseBlocks(inner) });
      continue;
    }

    // List (bullet or ordered) — indentation-aware, supports nesting + task items.
    if (listMarker(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    // Paragraph — gather consecutive plain lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^\s*(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !listMarker(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(para.join(" ")) });
  }

  return blocks;
}

/** Parse a full list starting at `start`, returning the block + the next index. */
function parseList(lines: string[], start: number): { block: Block; next: number } {
  const head = listMarker(lines[start])!;
  const baseIndent = head.indent;
  const ordered = head.ordered;
  const startNum = head.start;
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const marker = listMarker(lines[i]);
    if (!marker || marker.indent !== baseIndent || marker.ordered !== ordered) break;

    // The column where item content begins — children must be indented past it.
    const prefixLen = lines[i].length - marker.content.length;

    let firstContent = marker.content;
    let checked: boolean | null = null;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(firstContent);
    if (task) {
      checked = task[1] !== " ";
      firstContent = task[2];
    }

    const childLines: string[] = [firstContent];
    i++;

    let sawBlank = false;
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.trim() === "") {
        // Keep the blank only if a deeper-indented line continues this item.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j < lines.length && indentWidth(lines[j]) >= prefixLen) {
          childLines.push("");
          i++;
          sawBlank = true;
          continue;
        }
        break;
      }
      const ind = indentWidth(cur);
      if (ind >= prefixLen) {
        childLines.push(dedent(cur, prefixLen));
        i++;
        sawBlank = false;
        continue;
      }
      const sibling = listMarker(cur);
      if (sibling && ind === baseIndent && sibling.ordered === ordered) break; // next item
      if (!sawBlank && !sibling) {
        // Lazy paragraph continuation (wrapped line, no blank separator).
        childLines.push(cur.trim());
        i++;
        continue;
      }
      break;
    }

    items.push({ blocks: parseBlocks(childLines), checked });
  }

  return { block: { type: ordered ? "ordered_list" : "bullet_list", start: startNum, items }, next: i };
}

/** Parse a single line of inline markdown into a node list. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  // Combined matcher, scanned left to right. Order in the alternation matters:
  // code spans win first so their contents are never re-parsed; footnote refs are
  // tried before links so `[^id]` is not mistaken for a link label.
  const pattern =
    /(`[^`]+`)|(\[\^[^\]\s]+\])|(\[[^\]]*\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)/;

  while (rest.length) {
    const m = rest.match(pattern);
    if (!m || m.index === undefined) {
      nodes.push({ type: "text", value: rest });
      break;
    }
    if (m.index > 0) {
      nodes.push({ type: "text", value: rest.slice(0, m.index) });
    }
    const token = m[0];

    if (token.startsWith("`")) {
      nodes.push({ type: "code", value: token.slice(1, -1) });
    } else if (token.startsWith("[^")) {
      nodes.push({ type: "footnote_ref", id: token.slice(2, -1).trim(), index: 0 });
    } else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (link) {
        const label = link[1];
        const href = link[2];
        if (isSafeHref(href)) {
          nodes.push({ type: "link", href, route: isRouteHref(href), children: parseInline(label) });
        } else {
          // Unsafe protocol — keep the visible label as plain text, drop the link.
          nodes.push({ type: "text", value: label });
        }
      } else {
        nodes.push({ type: "text", value: token });
      }
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (token.startsWith("~~")) {
      nodes.push({ type: "strike", children: parseInline(token.slice(2, -2)) });
    } else {
      nodes.push({ type: "em", children: parseInline(token.slice(1, -1)) });
    }

    rest = rest.slice(m.index + token.length);
  }

  return nodes;
}

// ── footnote resolution ──────────────────────────────────────────────────────

type FootnoteState = { defs: Map<string, string>; order: Map<string, number>; counter: number };

/** Pull `[^id]: text` definition lines (incl. indented continuations) out of the
 *  stream so the block parser never sees them; returns the cleaned content. */
function extractFootnoteDefs(lines: string[]): { content: string[]; defs: Map<string, string> } {
  const content: string[] = [];
  const defs = new Map<string, string>();
  let i = 0;
  while (i < lines.length) {
    const m = /^\s{0,3}\[\^([^\]\s]+)\]:\s?(.*)$/.exec(lines[i]);
    if (m) {
      const id = m[1].trim();
      const parts = [m[2]];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && /^\s+\S/.test(lines[i])) {
        parts.push(lines[i].trim());
        i++;
      }
      defs.set(id, parts.join(" ").trim());
      continue;
    }
    content.push(lines[i]);
    i++;
  }
  return { content, defs };
}

function buildFootnoteItems(state: FootnoteState): FootnoteItem[] {
  return [...state.order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id, index]) => ({ id, index, children: parseInline(state.defs.get(id) ?? "") }));
}

function assignInlineIndices(nodes: InlineNode[], state: FootnoteState): void {
  for (const n of nodes) {
    if (n.type === "footnote_ref") {
      if (state.defs.has(n.id) && !state.order.has(n.id)) state.order.set(n.id, ++state.counter);
    } else if ("children" in n) {
      assignInlineIndices(n.children, state);
    }
  }
}

function assignBlockIndices(blocks: Block[], state: FootnoteState): void {
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
      case "paragraph":
        assignInlineIndices(b.children, state);
        break;
      case "bullet_list":
      case "ordered_list":
        b.items.forEach((it) => assignBlockIndices(it.blocks, state));
        break;
      case "blockquote":
        assignBlockIndices(b.blocks, state);
        break;
      case "table":
        b.headers.forEach((c) => assignInlineIndices(c, state));
        b.rows.forEach((r) => r.forEach((c) => assignInlineIndices(c, state)));
        break;
    }
  }
}

/** Rewrite footnote refs: defined → carries its number; undefined → literal text. */
function resolveInline(nodes: InlineNode[], state: FootnoteState): InlineNode[] {
  return nodes.map((n) => {
    if (n.type === "footnote_ref") {
      const idx = state.order.get(n.id);
      return idx ? { ...n, index: idx } : ({ type: "text", value: `[^${n.id}]` } as InlineNode);
    }
    if ("children" in n) {
      return { ...n, children: resolveInline(n.children, state) };
    }
    return n;
  });
}

function resolveBlock(block: Block, state: FootnoteState): Block {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return { ...block, children: resolveInline(block.children, state) };
    case "bullet_list":
    case "ordered_list":
      return { ...block, items: block.items.map((it) => ({ ...it, blocks: it.blocks.map((b) => resolveBlock(b, state)) })) };
    case "blockquote":
      return { ...block, blocks: block.blocks.map((b) => resolveBlock(b, state)) };
    case "table":
      return {
        ...block,
        headers: block.headers.map((c) => resolveInline(c, state)),
        rows: block.rows.map((r) => r.map((c) => resolveInline(c, state))),
      };
    default:
      return block;
  }
}

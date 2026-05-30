import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMarkdown, parseInline, isSafeHref, isRouteHref } from "./markdown";
import { MarkdownBlocks } from "@/components/copilot/markdown-message";

function html(md: string): string {
  return renderToStaticMarkup(createElement(MarkdownBlocks, { blocks: parseMarkdown(md) }));
}

describe("parseMarkdown — block structure", () => {
  it("parses headings at the right level", () => {
    const blocks = parseMarkdown("# Answer\n## Details");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "heading", level: 2 });
  });

  it("parses bullet and ordered lists", () => {
    const bullets = parseMarkdown("- one\n- two");
    expect(bullets[0]).toMatchObject({ type: "bullet_list" });
    expect((bullets[0] as any).items).toHaveLength(2);
    const ordered = parseMarkdown("1. first\n2. second");
    expect(ordered[0]).toMatchObject({ type: "ordered_list", start: 1 });
  });

  it("parses a GFM pipe table with header + rows", () => {
    const blocks = parseMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");
    const table = blocks[0] as any;
    expect(table.type).toBe("table");
    expect(table.headers).toHaveLength(2);
    expect(table.rows).toHaveLength(1);
  });

  it("parses fenced code blocks without re-parsing their content", () => {
    const blocks = parseMarkdown("```ts\nconst x = `1`;\n```");
    expect(blocks[0]).toMatchObject({ type: "code_block", lang: "ts" });
    expect((blocks[0] as any).value).toContain("const x");
  });
});

describe("MarkdownBlocks — rendering", () => {
  it("renders headings as heading elements", () => {
    const out = html("# Answer\n## Details");
    expect(out).toContain("<h3");
    expect(out).toContain("<h4");
    expect(out).toContain("Answer");
  });

  it("renders bullet lists as <ul><li>", () => {
    const out = html("- alpha\n- beta");
    expect(out).toContain("<ul");
    expect(out.match(/<li/g)?.length).toBe(2);
    expect(out).toContain("alpha");
  });

  it("renders a markdown table as a real <table>", () => {
    const out = html("| Student | Score |\n|---|---|\n| Ada | 91 |");
    expect(out).toContain("<table");
    expect(out).toContain("<th");
    expect(out).toContain("Student");
    expect(out).toContain("Ada");
  });

  it("escapes / disallows raw HTML (no HTML sink)", () => {
    const out = html("Hello <script>alert(1)</script> world");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders internal route links safely as anchors", () => {
    const out = html("See [admin runs](/admin/runs).");
    expect(out).toContain('href="/admin/runs"');
  });

  it("drops unsafe link protocols, keeping only the label text", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain('href="javascript');
    expect(out).toContain("click");
  });

  it("renders inline code spans", () => {
    const out = html("Use `list_students_with_profiles` now.");
    expect(out).toContain("<code");
    expect(out).toContain("list_students_with_profiles");
  });
});

describe("href safety helpers", () => {
  it("allows internal routes, http(s), and mailto", () => {
    expect(isSafeHref("/admin/runs")).toBe(true);
    expect(isSafeHref("https://example.com")).toBe(true);
    expect(isSafeHref("mailto:a@b.dev")).toBe(true);
    expect(isRouteHref("/admin/runs")).toBe(true);
  });

  it("rejects javascript:, data:, and protocol-relative URLs", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,evil")).toBe(false);
    expect(isSafeHref("//evil.com")).toBe(false);
    expect(isRouteHref("//evil.com")).toBe(false);
  });
});

describe("parseInline", () => {
  it("tokenizes bold, code, and links", () => {
    const nodes = parseInline("**bold** and `code` and [x](/r)");
    expect(nodes.some((n) => n.type === "strong")).toBe(true);
    expect(nodes.some((n) => n.type === "code")).toBe(true);
    expect(nodes.some((n) => n.type === "link" && n.route)).toBe(true);
  });

  it("tokenizes strikethrough", () => {
    const nodes = parseInline("keep ~~drop~~ done");
    expect(nodes.some((n) => n.type === "strike")).toBe(true);
  });
});

describe("nested lists", () => {
  it("parses a sub-list as nested blocks under its parent item", () => {
    const blocks = parseMarkdown("- parent\n  - child a\n  - child b\n- sibling");
    const list = blocks[0] as any;
    expect(list.type).toBe("bullet_list");
    expect(list.items).toHaveLength(2); // parent + sibling, not the children
    const nested = list.items[0].blocks.find((b: any) => b.type === "bullet_list");
    expect(nested).toBeTruthy();
    expect(nested.items).toHaveLength(2);
  });

  it("nests an ordered list inside a bullet item", () => {
    const blocks = parseMarkdown("- steps:\n  1. first\n  2. second");
    const list = blocks[0] as any;
    const nested = list.items[0].blocks.find((b: any) => b.type === "ordered_list");
    expect(nested).toBeTruthy();
    expect(nested.items).toHaveLength(2);
  });

  it("renders nested lists as a <ul> inside a <li>", () => {
    const out = html("- parent\n  - child a\n  - child b");
    // outer ul + inner ul = 2 uls; children are extra <li>s
    expect(out.match(/<ul/g)?.length).toBe(2);
    expect(out).toContain("child a");
    expect(out).toContain("child b");
  });
});

describe("task lists", () => {
  it("captures checked/unchecked state per item", () => {
    const blocks = parseMarkdown("- [x] done\n- [ ] todo\n- plain");
    const list = blocks[0] as any;
    expect(list.items[0].checked).toBe(true);
    expect(list.items[1].checked).toBe(false);
    expect(list.items[2].checked).toBe(null);
  });

  it("strips the checkbox marker from the rendered text", () => {
    const out = html("- [x] ship it");
    expect(out).toContain("ship it");
    expect(out).not.toContain("[x]");
  });
});

describe("footnotes", () => {
  it("links a reference to its definition and numbers by first use", () => {
    const blocks = parseMarkdown("See note[^a] and another[^b].\n\n[^b]: second\n[^a]: first");
    const footnotes = blocks.find((b: any) => b.type === "footnotes") as any;
    expect(footnotes).toBeTruthy();
    // [^a] referenced first → index 1, [^b] → index 2 regardless of def order
    const a = footnotes.items.find((f: any) => f.id === "a");
    const b = footnotes.items.find((f: any) => f.id === "b");
    expect(a.index).toBe(1);
    expect(b.index).toBe(2);
  });

  it("renders refs as superscript anchors and a footnotes section", () => {
    const out = html("Claim[^1] holds.\n\n[^1]: because evidence");
    expect(out).toContain("<sup");
    expect(out).toContain('href="#fn-1"');
    expect(out).toContain('id="fn-1"');
    expect(out).toContain("because evidence");
  });

  it("renders an undefined footnote reference as literal text, no anchor", () => {
    const out = html("Dangling[^x] ref with no def.");
    expect(out).toContain("[^x]");
    expect(out).not.toContain("#fn-x");
  });

  it("omits unreferenced definitions from the footnotes section", () => {
    const blocks = parseMarkdown("Body has no refs.\n\n[^unused]: never cited");
    expect(blocks.find((b: any) => b.type === "footnotes")).toBeUndefined();
  });
});

"use client";

import { useState } from "react";

type Snippet = { label: string; value: string };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-border bg-panel/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted hover:border-accent/60 hover:text-accent"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // noop
        }
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

export function BadgeEmbedSnippets({
  slug,
  profileUrl,
  svgUrl,
  jsonUrl,
}: {
  slug: string;
  profileUrl: string;
  svgUrl: string;
  jsonUrl: string;
}) {
  const markdown = `[![SkillProof verified](${svgUrl})](${profileUrl})`;
  const html = `<a href="${profileUrl}"><img src="${svgUrl}" alt="SkillProof verified" /></a>`;
  const linkedin = `Verified developer skills (SkillProof AI) — ${profileUrl}`;
  const snippets: Snippet[] = [
    { label: "GitHub README markdown", value: markdown },
    { label: "HTML", value: html },
    { label: "Public profile URL", value: profileUrl },
    { label: "LinkedIn summary line", value: linkedin },
    { label: "Badge JSON metadata", value: jsonUrl },
  ];
  return (
    <div className="space-y-2">
      {snippets.map((s) => (
        <div key={s.label}>
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
            <span>{s.label}</span>
            <CopyButton value={s.value} />
          </div>
          <pre className="mt-1 overflow-x-auto rounded border border-border bg-panel2/40 p-2 text-[11px] text-ink">
            {s.value}
          </pre>
        </div>
      ))}
      <p className="text-[11px] text-muted">
        Slug: <code className="rounded bg-panel2 px-1">{slug}</code>. The SVG endpoint reads the latest score on
        every request — re-verifying updates the badge automatically.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Visibility = "public" | "unlisted" | "private";

function CopyChip({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-border bg-panel/40 px-2 py-1 text-[11px] text-muted hover:border-accent/60 hover:text-accent"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // noop
        }
      }}
      title={value}
    >
      {copied ? "copied" : label}
    </button>
  );
}

export function ProfileRowActions({
  profileId,
  slug,
  url,
  svgUrl,
  initialVisibility,
  initialIncludeTerminalProof,
}: {
  profileId: string;
  slug: string;
  url: string;
  svgUrl: string;
  initialVisibility: Visibility;
  initialIncludeTerminalProof: boolean;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [includeTerminal, setIncludeTerminal] = useState(initialIncludeTerminalProof);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);

  const markdown = `[![SkillProof verified](${svgUrl})](${url})`;
  const linkedin = `Verified developer skills (SkillProof AI) — ${url}`;

  async function patch(next: Partial<{ visibility: Visibility; includeTerminalProof: boolean }>) {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/profile/${profileId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.detail ?? data.error ?? "failed");
        return false;
      }
      return true;
    } catch (e: any) {
      setErr(e?.message ?? "failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeVisibility(next: Visibility) {
    const prev = visibility;
    setVisibility(next);
    const ok = await patch({ visibility: next });
    if (!ok) setVisibility(prev);
  }

  async function toggleTerminal(next: boolean) {
    const prev = includeTerminal;
    setIncludeTerminal(next);
    const ok = await patch({ includeTerminalProof: next });
    if (!ok) setIncludeTerminal(prev);
  }

  async function unpublish() {
    if (!confirm(`Unpublish /${slug}? This deletes the profile (run + report remain).`)) return;
    setUnpublishing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/profile/${profileId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error ?? "failed");
        return;
      }
      router.refresh();
    } finally {
      setUnpublishing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">Visibility</span>
        {(["public", "unlisted", "private"] as Visibility[]).map((v) => (
          <button
            key={v}
            onClick={() => changeVisibility(v)}
            disabled={saving || v === visibility}
            className={`rounded border px-2 py-0.5 text-[11px] ${
              v === visibility ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:border-accent/60 hover:text-ink"
            }`}
          >
            {v}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={includeTerminal}
            disabled={saving}
            onChange={(e) => toggleTerminal(e.target.checked)}
          />
          include terminal proof
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyChip value={url} label="copy URL" />
        <CopyChip value={markdown} label="copy README markdown" />
        <CopyChip value={linkedin} label="copy LinkedIn summary" />
        <CopyChip value={svgUrl} label="copy badge SVG URL" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-border bg-panel2 px-2 py-1 text-[11px] text-ink hover:border-accent/60 hover:text-accent"
        >
          Open ↗
        </a>
        <Button
          size="sm"
          variant="outline"
          onClick={unpublish}
          disabled={unpublishing}
          className="!border-bad/60 !text-bad hover:!bg-bad/10"
        >
          {unpublishing ? "Unpublishing…" : "Unpublish"}
        </Button>
      </div>
      {err && <Badge tone="bad">{err}</Badge>}
    </div>
  );
}

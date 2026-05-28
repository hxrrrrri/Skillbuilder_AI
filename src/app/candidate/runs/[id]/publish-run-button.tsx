"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PublishRunButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [includeTerminalProof, setIncludeTerminalProof] = useState(false);

  async function publish() {
    setBusy(true);
    setError(null);
    setBlockers([]);
    try {
      const res = await fetch("/api/profile/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_id: runId, visibility, include_terminal_proof: includeTerminalProof }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "publish failed");
        if (Array.isArray(data.blockers)) {
          setBlockers(data.blockers.map((b: any) => b.message || b.code || String(b)));
        }
        return;
      }
      router.push(`/profile/${data.slug}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as any)}
          className="h-10 rounded-md border border-border bg-bg/65 px-3 text-sm text-ink"
        >
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="private">Private draft</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={includeTerminalProof}
            onChange={(e) => setIncludeTerminalProof(e.target.checked)}
          />
          Include terminal proof in public-safe report
        </label>
      </div>
      <Button onClick={publish} disabled={busy}>
        {busy ? "Publishing..." : visibility === "private" ? "Save private draft" : "Publish profile"}
      </Button>
      {error && <span className="text-xs text-bad">{error}</span>}
      {blockers.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          {blockers.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

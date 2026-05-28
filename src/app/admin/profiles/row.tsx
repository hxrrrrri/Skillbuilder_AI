"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ClientDateTime } from "@/components/ui/client-datetime";

type Visibility = "public" | "unlisted" | "private";
const OPTIONS: Visibility[] = ["public", "unlisted", "private"];

export function ProfileRow({
  id,
  slug,
  visibility,
  ownerEmail,
  candidateName,
  repo,
  runId,
  createdAt,
}: {
  id: string;
  slug: string;
  visibility: string;
  ownerEmail: string | null;
  candidateName: string | null;
  repo: string;
  runId: string;
  createdAt: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<string>(visibility);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function change(next: Visibility) {
    if (next === current) return;
    setError(null);
    const prev = current;
    setCurrent(next);
    const resp = await fetch(`/api/admin/profiles/${id}/visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: next }),
    });
    if (!resp.ok) {
      setCurrent(prev);
      const data = await resp.json().catch(() => ({}));
      setError(data?.error ?? `HTTP ${resp.status}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link href={`/profile/${slug}`} className="font-mono text-sm text-ink hover:text-accent">
          /{slug}
        </Link>
        <div className="mt-0.5 text-xs text-muted">
          {candidateName ?? ownerEmail ?? "anonymous"} · {repo} ·{" "}
          <Link href={`/admin/runs/${runId}`} className="text-muted hover:text-accent">
            trace
          </Link>{" "}
          · <ClientDateTime value={createdAt} mode="date" />
        </div>
        {error && <p className="mt-1 text-xs text-bad">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge
          tone={current === "public" ? "good" : current === "unlisted" ? "warn" : "default"}
        >
          {current}
        </Badge>
        <div className="flex items-center overflow-hidden rounded-md border border-border">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={pending}
              onClick={() => change(opt)}
              className={`px-2 py-1 text-[11px] transition ${
                current === opt
                  ? "bg-accent text-cream"
                  : "bg-panel2 text-muted hover:text-ink"
              } disabled:opacity-50`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </li>
  );
}

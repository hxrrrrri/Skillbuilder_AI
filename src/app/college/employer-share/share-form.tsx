"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CohortOption = { id: string; name: string };

export function ShareForm({ cohorts }: { cohorts: CohortOption[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setUrl(null);
    const minScore = String(data.get("minScore") || "").trim();
    const res = await fetch("/api/college/employer-share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cohortId: String(data.get("cohortId") || "") || null,
        minScore: minScore ? Number(minScore) : undefined,
        expiresInDays: Number(data.get("expiresInDays") || 30),
      }),
    });
    setPending(false);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError("Could not create share link.");
      return;
    }
    setUrl(payload.url);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_0.6fr_0.6fr_auto]">
      <select name="cohortId" className="h-11 rounded-md border border-border bg-bg/65 px-3 text-ink">
        <option value="">All public tenant profiles</option>
        {cohorts.map((cohort) => (
          <option key={cohort.id} value={cohort.id}>{cohort.name}</option>
        ))}
      </select>
      <Input name="minScore" type="number" min={0} max={100} placeholder="Min score" />
      <Input name="expiresInDays" type="number" min={1} max={90} defaultValue={30} />
      <Button type="submit" disabled={pending}>{pending ? "Creating" : "Create link"}</Button>
      {url && <p className="md:col-span-4 break-all font-mono text-xs text-accent">{url}</p>}
      {error && <p className="md:col-span-4 text-sm text-bad">{error}</p>}
    </form>
  );
}

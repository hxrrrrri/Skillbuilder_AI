"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CohortOption = { id: string; name: string };

export function InviteForm({ cohorts }: { cohorts: CohortOption[] }) {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setError(null);
    setUrl(null);
    const res = await fetch("/api/college/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        role: String(formData.get("role") ?? "candidate"),
        cohortId: String(formData.get("cohortId") || "") || null,
        expiresInDays: Number(formData.get("expiresInDays") || 14),
      }),
    });
    setPending(false);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError("Could not create invite.");
      return;
    }
    form.reset();
    setUrl(payload.url);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.6fr_auto]">
      <Input name="email" type="email" placeholder="student@example.edu" required />
      <select name="role" className="h-11 rounded-md border border-border bg-bg/65 px-3 text-ink">
        <option value="candidate">Candidate</option>
        <option value="college_member">College member</option>
        <option value="mentor">Mentor</option>
      </select>
      <select name="cohortId" className="h-11 rounded-md border border-border bg-bg/65 px-3 text-ink">
        <option value="">No cohort</option>
        {cohorts.map((cohort) => (
          <option key={cohort.id} value={cohort.id}>{cohort.name}</option>
        ))}
      </select>
      <Input name="expiresInDays" type="number" min={1} max={60} defaultValue={14} />
      <Button type="submit" disabled={pending}>{pending ? "Creating" : "Create invite"}</Button>
      {url && <p className="md:col-span-5 break-all font-mono text-xs text-accent">{url}</p>}
      {error && <p className="md:col-span-5 text-sm text-bad">{error}</p>}
    </form>
  );
}

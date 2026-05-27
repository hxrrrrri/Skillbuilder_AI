"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, TextArea } from "@/components/ui/input";

export function CohortCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const year = String(formData.get("year") ?? "").trim();
    const res = await fetch("/api/college/cohorts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        year: year ? Number(year) : null,
        notes: String(formData.get("notes") ?? "") || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Could not create cohort.");
      return;
    }
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form id="cohort-create-form" onSubmit={submit} className="grid gap-3 md:grid-cols-[1.2fr_0.6fr_2fr_auto]">
      <Input name="name" placeholder="Cohort name" required maxLength={120} />
      <Input name="year" placeholder="Year" inputMode="numeric" />
      <TextArea name="notes" placeholder="Notes" className="min-h-[44px]" maxLength={1000} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating" : "Create"}
      </Button>
      {error && <p className="text-sm text-bad md:col-span-4">{error}</p>}
    </form>
  );
}

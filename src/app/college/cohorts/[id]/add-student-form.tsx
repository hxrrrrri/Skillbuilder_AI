"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddStudentForm({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/college/cohorts/${cohortId}/students`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
    });
    setPending(false);
    if (!res.ok) {
      setMessage("No candidate exists for that email yet. Use the invite flow first.");
      return;
    }
    form.reset();
    setMessage("Student added.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <Input name="email" type="email" placeholder="student@example.edu" required />
      <Button type="submit" disabled={pending}>{pending ? "Adding" : "Add student"}</Button>
      {message && <p className="self-center text-sm text-muted">{message}</p>}
    </form>
  );
}

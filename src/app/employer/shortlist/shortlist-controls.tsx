"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ShortlistCreateControl() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    setMessage(null);
    const resp = await fetch("/api/employer/shortlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes: notes || undefined }),
    });
    if (!resp.ok) {
      setMessage(`Create failed (${resp.status})`);
      return;
    }
    setName("");
    setNotes("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Shortlist name"
        className="h-9 w-full rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="h-9 w-full rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      />
      <button
        type="button"
        onClick={create}
        disabled={pending || !name.trim()}
        className="w-full rounded-md border border-accent/70 bg-accent px-3 py-2 text-sm font-semibold text-cream shadow-glow disabled:opacity-50"
      >
        Create shortlist
      </button>
      {message && <div className="text-xs text-muted">{message}</div>}
    </div>
  );
}

export function ShortlistRemoveItemControl({
  shortlistId,
  itemId,
}: {
  shortlistId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function remove() {
    const resp = await fetch(`/api/employer/shortlist/${shortlistId}/items/${itemId}`, {
      method: "DELETE",
    });
    if (resp.ok) startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:border-bad/60 hover:text-bad disabled:opacity-50"
    >
      Remove
    </button>
  );
}

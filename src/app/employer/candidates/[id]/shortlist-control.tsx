"use client";

import { useState } from "react";

export function AddToShortlistControl({
  profileId,
  shortlists,
}: {
  profileId: string;
  shortlists: Array<{ id: string; name: string }>;
}) {
  const [shortlistId, setShortlistId] = useState(shortlists[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setMessage(null);
    if (!shortlistId) {
      setMessage("Create a shortlist first.");
      return;
    }
    const resp = await fetch(`/api/employer/shortlist/${shortlistId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_profile_id: profileId, note }),
    });
    setMessage(resp.ok ? "Added to shortlist." : `Failed (${resp.status})`);
  }

  if (shortlists.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-accent/40 bg-accent/10 p-3 text-xs text-muted">
        Create a shortlist before adding candidates.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={shortlistId}
        onChange={(e) => setShortlistId(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      >
        {shortlists.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note"
        className="h-9 w-full rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      />
      <button
        type="button"
        onClick={add}
        className="w-full rounded-md border border-accent/70 bg-accent px-3 py-2 text-sm font-semibold text-cream shadow-glow"
      >
        Add to shortlist
      </button>
      {message && <div className="text-xs text-muted">{message}</div>}
    </div>
  );
}

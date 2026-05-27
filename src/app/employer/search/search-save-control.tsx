"use client";

import { useState } from "react";

export function SearchSaveControl({ filters }: { filters: Record<string, any> }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setStatus(null);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== "" && k !== "save_name") params.set(k, String(v));
    }
    params.set("save_name", name || "Saved search");
    const resp = await fetch(`/api/employer/search?${params.toString()}`, { cache: "no-store" });
    if (!resp.ok) {
      setStatus(`Save failed (${resp.status})`);
      return;
    }
    setStatus("Saved");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Search name"
        className="h-10 rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      />
      <button
        type="button"
        onClick={save}
        className="rounded-md border border-border px-3 py-2 text-sm text-ink hover:border-accent/60"
      >
        Save search
      </button>
      {status && <span className="text-xs text-muted">{status}</span>}
    </div>
  );
}

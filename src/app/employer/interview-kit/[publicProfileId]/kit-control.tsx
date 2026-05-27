"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const FOCUS = ["debugging", "ai_collab", "architecture", "testing"] as const;

export function InterviewKitGenerateControl({
  profileId,
  defaultRole,
}: {
  profileId: string;
  defaultRole: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [targetRole, setTargetRole] = useState(defaultRole);
  const [focus, setFocus] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setMessage(null);
    const resp = await fetch("/api/employer/interview-kit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, target_role: targetRole, focus }),
    });
    if (!resp.ok) {
      setMessage(`Generate failed (${resp.status})`);
      return;
    }
    setMessage("Generated");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={targetRole}
        onChange={(e) => setTargetRole(e.target.value)}
        className="h-9 rounded-md border border-border bg-bg/65 px-2 text-sm text-ink"
      />
      {FOCUS.map((item) => (
        <label key={item} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={focus.includes(item)}
            onChange={(e) => {
              setFocus((prev) => e.target.checked ? [...prev, item] : prev.filter((x) => x !== item));
            }}
            className="accent-accent"
          />
          {item.replace("_", " ")}
        </label>
      ))}
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="rounded-md border border-accent/70 bg-accent px-3 py-2 text-sm font-semibold text-cream shadow-glow disabled:opacity-50"
      >
        Generate
      </button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </div>
  );
}

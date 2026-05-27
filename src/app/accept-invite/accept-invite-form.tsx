"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AcceptInviteForm({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/college/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        name: String(formData.get("name") || "") || undefined,
        password: String(formData.get("password") || "") || undefined,
        github_username: String(formData.get("github_username") || "") || undefined,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error === "registration_required" ? "Name and password are required for new accounts." : "Could not accept this invite.");
      return;
    }
    setMessage("Invite accepted. You can continue to your SkillProof workspace.");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!signedIn && (
        <>
          <Input name="name" placeholder="Full name" required minLength={2} />
          <Input name="password" type="password" placeholder="Create password" required minLength={8} />
        </>
      )}
      <Input name="github_username" placeholder="GitHub username" />
      <Button type="submit" disabled={pending}>{pending ? "Accepting" : "Accept invite"}</Button>
      {message && <p className="text-sm text-good">{message}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}

"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function SettingsForm({
  initialName,
  initialGithubUsername,
  email,
  githubOauthEnabled,
}: {
  initialName: string;
  initialGithubUsername: string;
  email: string;
  githubOauthEnabled: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [githubUsername, setGithubUsername] = useState(initialGithubUsername);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  const [deletePw, setDeletePw] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/candidate/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          githubUsername: githubUsername.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileMsg({ ok: false, text: data.detail ?? data.error ?? "failed" });
        return;
      }
      setProfileMsg({ ok: true, text: "Saved." });
    } catch (e: any) {
      setProfileMsg({ ok: false, text: e?.message ?? "failed" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setChangingPw(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/candidate/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwMsg({ ok: false, text: data.error ?? "failed" });
        return;
      }
      setPwMsg({ ok: true, text: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      setPwMsg({ ok: false, text: e?.message ?? "failed" });
    } finally {
      setChangingPw(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/candidate/delete-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: deletePw, confirm: deleteConfirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteErr(data.error ?? "failed");
        return;
      }
      await signOut({ callbackUrl: "/" });
    } catch (e: any) {
      setDeleteErr(e?.message ?? "failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Profile</h3>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">Email (read-only)</label>
          <Input value={email} disabled className="mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted">GitHub username</label>
          <Input
            value={githubUsername}
            onChange={(e) => setGithubUsername(e.target.value)}
            className="mt-1"
            placeholder="octocat"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save profile"}
          </Button>
          {profileMsg && (
            <Badge tone={profileMsg.ok ? "good" : "bad"}>{profileMsg.text}</Badge>
          )}
        </div>
        <div className="rounded border border-border bg-panel/40 p-3 text-xs">
          <div className="font-semibold text-ink">Connect GitHub</div>
          <p className="mt-1 text-muted">
            Verifies repo ownership via GitHub OAuth. Self-declared GitHub identities on your existing
            runs upgrade to <code className="rounded bg-panel2 px-1">github_oauth_owner_match</code> when the
            connected login matches.
          </p>
          {githubOauthEnabled ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => signIn("github", { callbackUrl: "/candidate/settings" })}
            >
              Connect GitHub
            </Button>
          ) : (
            <Badge tone="warn" className="mt-2 inline-flex">
              OAuth not configured — set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
            </Badge>
          )}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-ink">Change password</h3>
        <Input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          type="password"
          placeholder="New password (min 8 chars)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button onClick={changePassword} disabled={changingPw || newPassword.length < 8}>
            {changingPw ? "Updating…" : "Update password"}
          </Button>
          {pwMsg && <Badge tone={pwMsg.ok ? "good" : "bad"}>{pwMsg.text}</Badge>}
        </div>
      </section>

      <section className="space-y-3 border-t border-bad/30 pt-6">
        <h3 className="text-sm font-semibold text-bad">Danger zone — delete account</h3>
        <p className="text-xs text-muted">
          Re-authentication required. Soft delete: profiles hidden, identifying fields cleared, runs preserved for
          audit. Action is logged as <code>user.deleted</code>.
        </p>
        <Input
          type="password"
          placeholder="Your current password"
          value={deletePw}
          onChange={(e) => setDeletePw(e.target.value)}
        />
        <Input
          placeholder='Type DELETE to confirm'
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="!border-bad !text-bad hover:!bg-bad/10"
            onClick={deleteAccount}
            disabled={deleting || !deletePw || deleteConfirm !== "DELETE"}
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </Button>
          {deleteErr && <Badge tone="bad">{deleteErr}</Badge>}
        </div>
      </section>
    </div>
  );
}

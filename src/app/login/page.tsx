import { Suspense } from "react";
import { LoginForm } from "./form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const githubEnabled = !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="font-display text-3xl text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Welcome back to SkillProof AI. Sign in to publish your verified profile, review candidate
        proof, or manage your cohort.
      </p>
      <Suspense fallback={<div className="mt-6 text-sm text-muted">Loading…</div>}>
        <LoginForm githubEnabled={githubEnabled} googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}

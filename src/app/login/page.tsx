import { Suspense } from "react";
import { LoginForm } from "./form";
import { SectionPictogram } from "@/components/brand/skillproof-mark";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const githubEnabled = !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return (
    <div className="mx-auto max-w-md py-10">
      <SectionPictogram type="account" className="mb-7 text-accent" />
      <h1 className="font-display text-4xl font-medium leading-tight text-ink">Sign in</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Welcome back to SkillProof AI. Sign in to publish your verified profile, review candidate
        proof, or manage your cohort.
      </p>
      <Suspense fallback={<div className="mt-6 text-sm text-muted">Loading…</div>}>
        <LoginForm githubEnabled={githubEnabled} googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}

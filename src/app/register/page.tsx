import { RegisterForm } from "./form";
import { SectionPictogram } from "@/components/brand/skillproof-mark";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md py-10">
      <SectionPictogram type="account" className="mb-7 text-accent" />
      <h1 className="font-display text-4xl font-medium leading-tight text-ink">Create your account</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Sign up as a candidate to prove your work, as an employer to find verified developers, or as a
        college to track placement readiness.
      </p>
      <RegisterForm />
    </div>
  );
}

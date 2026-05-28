import { cn } from "@/lib/utils";

export function SkillProofMark({ className, label = "SkillProof" }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={cn("h-8 w-8 text-accent", className)}
      fill="none"
    >
      <path
        d="M32 7v50M7 32h50M14.3 14.3l35.4 35.4M49.7 14.3 14.3 49.7"
        stroke="currentColor"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="10.5" fill="currentColor" opacity=".9" />
      <circle cx="32" cy="32" r="4.5" fill="#070a12" />
    </svg>
  );
}

export function HeroProofGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 260"
      aria-hidden="true"
      className={cn("proof-float h-auto w-full max-w-[280px] text-accent", className)}
      fill="none"
    >
      <path
        className="proof-line"
        d="M150 64 210 54 252 98 232 158 166 150 128 104 150 64ZM166 150l44-96M128 104l124-6M210 54l22 104"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".88"
      />
      {[150, 210, 252, 232, 166, 128].map((cx, i) => {
        const cy = [64, 54, 98, 158, 150, 104][i];
        return <circle key={`${cx}-${cy}`} className="proof-node" cx={cx} cy={cy} r="18" fill="currentColor" />;
      })}
      <path
        d="M80 172c22-44 48-50 42-12 13-28 38-28 30 4 16-20 36-12 24 10 20-4 30 12 13 28-18 18-48 30-78 22-22-6-38-20-31-52Z"
        stroke="#eef7ff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="146" cy="172" r="16" fill="currentColor" opacity=".95" />
    </svg>
  );
}

export function SectionPictogram({
  type,
  className,
}: {
  type: "contract" | "audit" | "verify" | "campus" | "account";
  className?: string;
}) {
  const common = "stroke-current";
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true" className={cn("h-12 w-12 text-body", className)} fill="none">
      {type === "contract" && (
        <>
          <rect className={common} x="12" y="9" width="26" height="38" rx="3" strokeWidth="2" />
          <path className={common} d="M18 20h14M18 28h14M18 36h8" strokeWidth="2" strokeLinecap="round" />
          <path className={common} d="m35 34 5 5 9-12" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {type === "audit" && (
        <>
          <circle className={common} cx="24" cy="24" r="13" strokeWidth="2" />
          <path className={common} d="m34 34 10 10M19 24l4 4 8-10" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {type === "verify" && (
        <>
          <path className={common} d="M28 7 45 14v13c0 11-7 18-17 22-10-4-17-11-17-22V14l17-7Z" strokeWidth="2" />
          <path className={common} d="m20 28 6 6 12-14" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {type === "campus" && (
        <>
          <path className={common} d="M8 23 28 12l20 11-20 11L8 23Z" strokeWidth="2" strokeLinejoin="round" />
          <path className={common} d="M16 28v9c7 5 17 5 24 0v-9M48 23v16" strokeWidth="2" strokeLinecap="round" />
          <circle cx="48" cy="43" r="2.5" fill="currentColor" />
        </>
      )}
      {type === "account" && (
        <>
          <circle className={common} cx="28" cy="20" r="8" strokeWidth="2" />
          <path className={common} d="M13 47c2.8-10 9-15 15-15s12.2 5 15 15" strokeWidth="2" strokeLinecap="round" />
          <path className={common} d="m38 18 4 4 8-10" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

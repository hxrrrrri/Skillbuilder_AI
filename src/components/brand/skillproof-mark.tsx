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
      viewBox="0 0 260 260"
      aria-hidden="true"
      className={cn("h-auto w-full max-w-[220px]", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* dark card */}
      <rect x="48" y="60" width="148" height="148" rx="22" fill="#1a1208" stroke="#c1623f" strokeWidth="7" />
      {/* avatar circle */}
      <circle cx="90" cy="104" r="18" stroke="#c1623f" strokeWidth="6" fill="none" />
      {/* text lines */}
      <line x1="118" y1="98" x2="178" y2="98" stroke="#c1623f" strokeWidth="6" strokeLinecap="round" />
      <line x1="80" y1="148" x2="178" y2="148" stroke="#c1623f" strokeWidth="6" strokeLinecap="round" />
      <line x1="80" y1="170" x2="178" y2="170" stroke="#c1623f" strokeWidth="6" strokeLinecap="round" />
      <line x1="80" y1="192" x2="150" y2="192" stroke="#c1623f" strokeWidth="6" strokeLinecap="round" />
      {/* code brackets bottom-right */}
      <text x="162" y="242" fontFamily="monospace" fontSize="30" fill="white" fontWeight="bold">&lt;&gt;</text>
      {/* arrow + CV label top-right */}
      <path d="M140 40 Q170 20 190 50" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M188 46 L190 55 L181 52" fill="white" />
      <text x="192" y="38" fontFamily="sans-serif" fontSize="22" fill="white" fontWeight="600">CV</text>
    </svg>
  );
}

export function VerificationChecklist({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="100" y="56" width="312" height="400" rx="32" stroke="currentColor" strokeWidth="28" />
      <line x1="148" y1="142" x2="364" y2="142" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <line x1="148" y1="218" x2="364" y2="218" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <line x1="148" y1="294" x2="364" y2="294" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <line x1="148" y1="370" x2="364" y2="370" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
      <line x1="148" y1="446" x2="324" y2="446" stroke="currentColor" strokeWidth="20" strokeLinecap="round" />
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

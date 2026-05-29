import { cn } from "@/lib/utils";

export function SkillProofMark({ className, label = "SkillProof" }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      className={cn("h-8 w-8", className)}
      fill="currentColor"
    >
      {/*
        SP interlocked logo:
        Union of top-bar + left-col + mid-bar + right-col + bottom-bar
        Two rectangular notches cut out: top-right (P opening) and bottom-left (S opening)
        Vertices: (13,13),(87,13),(87,28),(28,28),(28,43),(87,43),(87,88),(13,88),(13,73),(72,73),(72,58),(13,58)
        r=5 rounded corners
      */}
      <path d="
        M 18,13
        L 82,13  Q 87,13 87,18
        L 87,23  Q 87,28 82,28
        L 33,28  Q 28,28 28,33
        L 28,38  Q 28,43 33,43
        L 82,43  Q 87,43 87,48
        L 87,83  Q 87,88 82,88
        L 18,88  Q 13,88 13,83
        L 13,78  Q 13,73 18,73
        L 67,73  Q 72,73 72,68
        L 72,63  Q 72,58 67,58
        L 18,58  Q 13,58 13,53
        L 13,18  Q 13,13 18,13
        Z
      " />
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
      viewBox="0 0 444 580"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="19" y="13" width="405" height="552" rx="45" ry="45" fill="#141413" />
      <rect x="19" y="13" width="405" height="552" rx="45" ry="45" stroke="currentColor" strokeWidth="18" />
      <line x1="85" y1="154" x2="358" y2="154" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <line x1="85" y1="222" x2="358" y2="222" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <line x1="85" y1="291" x2="358" y2="291" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <line x1="85" y1="355" x2="358" y2="355" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <line x1="85" y1="430" x2="358" y2="430" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

export function AuditMagnifying({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Magnifying glass circle */}
      <circle cx="196" cy="196" r="148" stroke="currentColor" strokeWidth="36" />
      {/* Handle */}
      <line x1="304" y1="304" x2="448" y2="448" stroke="currentColor" strokeWidth="36" strokeLinecap="round" />
      {/* Checkmark inside lens */}
      <path
        d="M120 200 L172 252 L280 140"
        stroke="currentColor"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VerifyBadge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Shield */}
      <path
        d="M256 48 L432 120 V264 C432 368 352 432 256 472 C160 432 80 368 80 264 V120 Z"
        stroke="currentColor"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Checkmark */}
      <path
        d="M172 264 L224 316 L340 196"
        stroke="currentColor"
        strokeWidth="38"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

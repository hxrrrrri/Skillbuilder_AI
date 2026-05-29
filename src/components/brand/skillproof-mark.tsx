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

export function AuditMagnifying({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Magnifying glass lens circle */}
      <circle cx="180" cy="180" r="140" stroke="currentColor" strokeWidth="36" />
      {/* Magnifying glass handle */}
      <line x1="280" y1="280" x2="420" y2="420" stroke="currentColor" strokeWidth="36" strokeLinecap="round" />
      {/* Box inside lens */}
      <rect x="100" y="120" width="160" height="120" rx="16" stroke="currentColor" strokeWidth="18" />
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
      {/* Badge/seal shape with scalloped edges */}
      <path
        d="M256 40 L312 72 L350 36 L365 98 L428 80 L395 138 L450 165 L382 190 L410 255 L350 235 L370 300 L305 265 L256 320 L207 265 L142 300 L162 235 L102 255 L130 190 L62 165 L127 138 L94 80 L157 98 L172 36 L210 72 Z"
        stroke="currentColor"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Checkmark */}
      <path
        d="M 180 260 L 240 310 L 360 160"
        stroke="currentColor"
        strokeWidth="40"
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

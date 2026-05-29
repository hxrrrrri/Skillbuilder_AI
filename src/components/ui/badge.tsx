import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "good" | "warn" | "bad" | "accent";

const TONES: Record<Tone, string> = {
  default: "bg-panel2/70 text-muted border-border",
  good: "bg-good/10 text-good border-good/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  bad: "bg-bad/10 text-bad border-bad/30",
  accent: "bg-accent/12 text-accent border-accent/35",
};

export function Badge({ tone = "default", className, ...rest }: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold leading-none",
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
}

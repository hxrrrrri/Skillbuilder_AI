import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "good" | "warn" | "bad" | "accent";

const TONES: Record<Tone, string> = {
  default: "bg-panel2 text-muted border-border",
  good: "bg-accent/10 text-accent border-accent/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  bad: "bg-bad/10 text-bad border-bad/30",
  accent: "bg-accent2/10 text-accent2 border-accent2/30",
};

export function Badge({ tone = "default", className, ...rest }: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
}

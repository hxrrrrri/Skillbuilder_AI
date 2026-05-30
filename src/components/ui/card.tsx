import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-panel/82 shadow-card backdrop-blur-sm",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-border px-5 py-4", className)} {...rest} />;
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-xl font-medium leading-tight text-ink", className)} {...rest} />;
}

export function StatusLight({ className, healthy = true }: { className?: string; healthy?: boolean }) {
  return (
    <span
      className={cn("status-light", healthy ? "status-light-good" : "status-light-bad", className)}
      aria-hidden="true"
    />
  );
}

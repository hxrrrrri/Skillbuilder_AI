"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
};

export function Button({ className, variant = "primary", size = "md", ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants = {
    primary: "border border-ink/90 bg-ink text-bg shadow-glow hover:border-cream hover:bg-cream active:bg-soft",
    ghost: "bg-transparent text-muted hover:bg-panel2 hover:text-ink",
    outline: "border border-border bg-panel text-ink hover:border-accent/60 hover:bg-panel2 hover:text-cream",
  } as const;
  const sizes = {
    sm: "h-9 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  } as const;
  return <button className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}

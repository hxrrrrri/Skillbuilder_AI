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
    primary: "border border-accent/70 bg-accent text-cream shadow-glow hover:bg-[#ba654f] active:bg-[#a9583f]",
    ghost: "bg-transparent text-ink hover:bg-panel2 hover:text-accent",
    outline: "border border-border bg-bg/30 text-ink hover:border-accent/60 hover:bg-panel2 hover:text-accent",
  } as const;
  const sizes = {
    sm: "h-9 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  } as const;
  return <button className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}

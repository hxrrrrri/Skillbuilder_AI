"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
};

export function Button({ className, variant = "primary", size = "md", ...rest }: Props) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-accent text-black hover:bg-accent/90 shadow-glow",
    ghost: "bg-transparent text-ink hover:bg-panel2",
    outline: "border border-border text-ink hover:bg-panel2",
  } as const;
  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  } as const;
  return <button className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}

"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-md border border-border bg-bg/65 px-3 text-ink placeholder:text-muted",
          "shadow-inner shadow-black/10 transition focus:border-accent/80 focus:outline-none focus:ring-2 focus:ring-accent/25",
          className
        )}
        {...rest}
      />
    );
  }
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] w-full rounded-md border border-border bg-bg/65 p-3 text-ink placeholder:text-muted",
          "shadow-inner shadow-black/10 transition focus:border-accent/80 focus:outline-none focus:ring-2 focus:ring-accent/25",
          className
        )}
        {...rest}
      />
    );
  }
);

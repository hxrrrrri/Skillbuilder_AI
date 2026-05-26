"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-md border border-border bg-panel2 px-3 text-ink placeholder:text-muted",
          "focus:outline-none focus:ring-2 focus:ring-accent/60",
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
          "min-h-[120px] w-full rounded-md border border-border bg-panel2 p-3 text-ink placeholder:text-muted",
          "focus:outline-none focus:ring-2 focus:ring-accent/60",
          className
        )}
        {...rest}
      />
    );
  }
);

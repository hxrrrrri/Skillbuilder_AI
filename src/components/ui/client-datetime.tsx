"use client";

import { useEffect, useState } from "react";

type Mode = "date" | "datetime";

type ClientDateTimeProps = {
  value: string | Date | null | undefined;
  empty?: string;
  mode?: Mode;
};

function parseDate(value: ClientDateTimeProps["value"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFallback(date: Date, mode: Mode): string {
  const iso = date.toISOString();
  if (mode === "date") return iso.slice(0, 10);
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

export function ClientDateTime({ value, empty = "-", mode = "datetime" }: ClientDateTimeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const date = parseDate(value);
  if (!date) return <span>{empty}</span>;

  const display = mounted
    ? mode === "date"
      ? date.toLocaleDateString()
      : date.toLocaleString()
    : formatFallback(date, mode);

  return <span>{display}</span>;
}

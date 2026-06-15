"use client";

import { useState, type ReactNode } from "react";

export function ToggleDetails({
  openLabel,
  closeLabel,
  children,
  className = "",
  summaryClassName = "",
  defaultOpen = false
}: {
  openLabel: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details className={className} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={summaryClassName}>{open ? closeLabel : openLabel}</summary>
      {children}
    </details>
  );
}

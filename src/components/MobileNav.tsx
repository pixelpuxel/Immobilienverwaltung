"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoutButton } from "./LogoutButton";
import { ViewSwitcher } from "./ViewSwitcher";

export function MobileNav({
  email,
  links,
  userId,
  canSwitchView
}: {
  email: string;
  links: string[][];
  userId: string;
  canSwitchView: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full overflow-x-hidden border-b border-line bg-white lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-base font-bold">Immobilienportal</div>
          <div className="max-w-[210px] truncate text-xs text-muted">{email}</div>
        </div>
        <button
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="button-secondary min-h-10 px-4 py-2 text-sm"
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          Menü
        </button>
      </div>
      {open ? (
        <nav id="mobile-navigation" className="grid gap-1 border-t border-line bg-panel p-3">
          {links.map(([label, href]) => (
            <Link
              key={href}
              className="rounded-md bg-white px-4 py-3 text-sm font-semibold"
              href={href}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          {canSwitchView ? <ViewSwitcher currentUserId={userId} /> : null}
          <div className="mt-2">
            <LogoutButton />
          </div>
        </nav>
      ) : null}
    </header>
  );
}

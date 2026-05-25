import Link from "next/link";
import { Role } from "@prisma/client";
import { LogoutButton } from "./LogoutButton";
import { MobileNav } from "./MobileNav";
import { ViewSwitcher } from "./ViewSwitcher";
import { roleLabel } from "@/lib/display";

const adminLinks = [
  ["Dashboard", "/dashboard"],
  ["Immobilien", "/properties"],
  ["Dokumente", "/documents"],
  ["Benutzer", "/users"],
  ["Vertraege", "/contracts"],
  ["Aktivitäten", "/audit"],
  ["Einstellungen", "/settings"]
];

const brokerLinks = [
  ["Dashboard", "/dashboard"],
  ["Immobilien", "/broker"],
  ["Dokumente", "/documents"]
];

const tenantLinks = [
  ["Dashboard", "/dashboard"],
  ["Mieterbereich", "/tenant"],
  ["Vertraege", "/contracts"]
];

export function AppShell({
  role,
  userId,
  email,
  canSwitchView = false,
  children
}: {
  role: Role;
  userId: string;
  email: string;
  canSwitchView?: boolean;
  children: React.ReactNode;
}) {
  const links = role === Role.ADMIN ? adminLinks : role === Role.BROKER ? brokerLinks : tenantLinks;
  return (
    <div className="min-h-screen bg-white">
      <MobileNav email={email} links={links} userId={userId} canSwitchView={canSwitchView} />
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-panel px-5 py-6 lg:block">
        <div className="text-xl font-bold">Immobilienportal</div>
        <div className="mt-1 text-sm text-muted">{email}</div>
        <div className="mt-1 text-xs font-semibold text-muted">{roleLabel(role)}</div>
        <nav className="mt-8 grid gap-1">
          {links.map(([label, href]) => (
            <Link key={href} className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-white" href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-6 left-5 right-5 grid gap-3">
          {canSwitchView ? <ViewSwitcher currentUserId={userId} /> : null}
          <LogoutButton />
        </div>
      </aside>
      <main className="w-full overflow-x-hidden lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

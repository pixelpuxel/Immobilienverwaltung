import Link from "next/link";
import { Role } from "@prisma/client";
import { AgentChatWidget } from "./AgentChatWidget";
import { LogoutButton } from "./LogoutButton";
import { MenuSearch } from "./MenuSearch";
import { MobileNav } from "./MobileNav";
import { ViewSwitcher } from "./ViewSwitcher";
import { roleLabel } from "@/lib/display";

const adminLinks = [
  ["Dashboard", "/dashboard"],
  ["Suche", "/search"],
  ["Immobilien", "/properties"],
  ["Karte", "/map"],
  ["Mieteinnahmen", "/rent-income"],
  ["Aktuelle Mieterliste", "/current-tenants"],
  ["Offene To-dos", "/todos"],
  ["Dokumente", "/documents"],
  ["Benutzer", "/users"],
  ["Vertraege", "/contracts"],
  ["Aktivitäten", "/audit"],
  ["Einstellungen", "/settings"]
];

const brokerLinks = [
  ["Dashboard", "/dashboard"],
  ["Suche", "/search"],
  ["Immobilien", "/broker"],
  ["Karte", "/map"],
  ["Dokumente", "/documents"]
];

const tenantLinks = [
  ["Dashboard", "/dashboard"],
  ["Suche", "/search"],
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
          <MenuSearch />
          <LogoutButton />
        </div>
      </aside>
      <main className="w-full overflow-x-hidden lg:pl-64">
        {canSwitchView ? (
          <div className="sticky top-0 z-30 hidden border-b border-line bg-white/95 px-5 py-3 backdrop-blur lg:block">
            <div className="mx-auto flex w-full max-w-7xl justify-end">
              <ViewSwitcher currentUserId={userId} compact />
            </div>
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-8">{children}</div>
      </main>
      <AgentChatWidget />
    </div>
  );
}

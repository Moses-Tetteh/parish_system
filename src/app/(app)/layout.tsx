import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { visibleNav } from "@/lib/nav";
import { logoutAction } from "./logout-action";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const groups = visibleNav(user.role);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-brand-900 bg-brand-700 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          {/* Pure-HTML disclosure menu: works without client JS, keyboard accessible, great on phones. */}
          <details className="group relative lg:hidden">
            <summary className="btn cursor-pointer list-none text-white hover:bg-white/10" aria-label="Open menu">☰ Menu</summary>
            <nav aria-label="Main" className="absolute left-0 top-12 max-h-[80dvh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl">
              <NavLinks groups={groups} />
            </nav>
          </details>
          <Link href="/dashboard" className="font-semibold tracking-tight">Parish Records</Link>
          <Link href="/search" className="ml-auto btn text-white hover:bg-white/10">Search</Link>
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-medium">{user.fullName || user.username}</div>
            <div className="text-brand-100">{ROLE_LABELS[user.role]}</div>
          </div>
          <Link href="/account/password" className="btn hidden text-white hover:bg-white/10 sm:inline-flex">Password</Link>
          <form action={logoutAction}><button className="btn text-white hover:bg-white/10">Sign out</button></form>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav aria-label="Main" className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2"><NavLinks groups={groups} /></div>
        </nav>
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function NavLinks({ groups }: { groups: ReturnType<typeof visibleNav> }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
          <ul className="mt-1">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="block rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-900">{i.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

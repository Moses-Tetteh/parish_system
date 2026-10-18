import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { visibleNav } from "@/lib/nav";
import { TopNav } from "@/components/TopNav";
import { AppFooter } from "@/components/AppFooter";
import { logoutAction } from "./logout-action";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { top, groups } = visibleNav(user.role);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <TopNav
        top={top}
        groups={groups}
        user={{ name: user.username, initial: user.username.charAt(0).toUpperCase(), roleLabel: ROLE_LABELS[user.role], canManageUsers: user.role === "admin" }}
        logoutAction={logoutAction}
      />
      <main id="main" className="container">{children}</main>
      <AppFooter />
    </>
  );
}

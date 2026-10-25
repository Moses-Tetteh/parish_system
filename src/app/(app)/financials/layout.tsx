import { requireUser } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { FinancialsTabs } from "@/components/FinancialsTabs";

export const dynamic = "force-dynamic";

/** Tabs per role (PHP: financials_tabs_for_role). Every page still enforces its own permission; this only avoids advertising dead links. */
export default async function FinancialsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const tx = roleCan(user.role, "financials.transactions"), core = roleCan(user.role, "financials.core"), members = roleCan(user.role, "financials.members");
  if (!tx && !core && !members) redirect("/forbidden");
  const tabs = [
    tx && { href: "/financials", label: "Transactions" },
    tx && { href: "/financials/ledger", label: "Ledger / Print" },
    core && { href: "/financials/categories", label: "Categories" },
    tx && { href: "/financials/statement", label: "Financial Statement" },
    core && { href: "/financials/budget", label: "Budgeting" },
    members && { href: "/financials/members", label: "Members" },
    members && { href: "/financials/dues", label: "Dues" },
  ].filter((t): t is { href: string; label: string } => !!t);
  return (<><FinancialsTabs tabs={tabs} />{children}</>);
}

import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import { changeRoleAction, toggleUserAction } from "./actions";
import { CreateUserForm, ResetPasswordForm } from "./Forms";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requirePermission("users.manage");
  const users = await db().select({
    id: schema.users.id, username: schema.users.username, fullName: schema.users.fullName,
    role: schema.users.role, isActive: schema.users.isActive,
  }).from(schema.users).orderBy(asc(schema.users.username)); // password hashes are never selected

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>
      <CreateUserForm />
      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id} className="card flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{u.username}{u.id === me.id && <span className="ml-2 badge bg-brand-100 text-brand-900">you</span>}
                {u.isActive !== 1 && <span className="ml-2 badge bg-slate-200 text-slate-700">disabled</span>}</div>
              <div className="text-sm text-slate-600">{u.fullName || "—"}</div>
            </div>
            <form action={changeRoleAction.bind(null, u.id)} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`r${u.id}`}>Role</label>
              <select id={`r${u.id}`} name="role" defaultValue={u.role} className="input !w-48">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
              <button className="btn-secondary !min-h-9">Set role</button>
            </form>
            <ResetPasswordForm id={u.id} />
            {u.id !== me.id && (
              <form action={toggleUserAction.bind(null, u.id)}>
                <button className={u.isActive === 1 ? "btn-danger !min-h-9" : "btn-secondary !min-h-9"}>{u.isActive === 1 ? "Disable" : "Enable"}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { ConfirmForm } from "@/components/ConfirmForm";
import { changeRoleAction, toggleUserAction } from "./actions";
import { CreateUserForm, ResetPasswordForm, RoleForm } from "./Forms";

export const metadata = { title: "Manage Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requirePermission("users.manage");
  const users = await db().select({
    id: schema.users.id, username: schema.users.username, fullName: schema.users.fullName,
    role: schema.users.role, isActive: schema.users.isActive,
  }).from(schema.users).orderBy(asc(schema.users.username)); // password hashes are never selected

  return (
    <>
      <h1>Manage Users</h1>
      <p className="hint" style={{ marginTop: 0, marginBottom: 18 }}>Add staff accounts, change roles, reset passwords and deactivate users who have left.</p>

      <CreateUserForm />

      <div className="card">
        <h2>Existing Users</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Username</th><th scope="col">Full Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}{u.id === me.id && <> <span className="hint">(you)</span></>}</td>
                  <td>{u.fullName || "—"}</td>
                  <td><RoleForm id={u.id} role={u.role} action={changeRoleAction.bind(null, u.id)} /></td>
                  <td><span className={`badge${u.isActive === 1 ? "" : " badge-archived"}`}>{u.isActive === 1 ? "Active" : "Inactive"}</span></td>
                  <td className="row-actions">
                    <ResetPasswordForm id={u.id} />
                    {u.id !== me.id && (
                      <ConfirmForm action={toggleUserAction.bind(null, u.id)} message={u.isActive === 1 ? "Deactivate this user? They will no longer be able to log in." : "Activate this user?"}>
                        <button type="submit" className={`btn btn-small${u.isActive === 1 ? " btn-danger" : ""}`}>{u.isActive === 1 ? "Deactivate" : "Activate"}</button>
                      </ConfirmForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Deactivated users can no longer log in, but their name stays attached to any records they&rsquo;ve created or edited. You can&rsquo;t deactivate your own account here — ask another admin if you need to be deactivated.</p>
      </div>
    </>
  );
}

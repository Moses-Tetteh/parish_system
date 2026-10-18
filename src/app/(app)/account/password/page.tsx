import { requireUser } from "@/lib/auth/session";
import { PasswordForm } from "./PasswordForm";
export const metadata = { title: "Change password" };
export default async function Page() {
  await requireUser();
  return (<div className="space-y-4"><h1 className="text-2xl font-bold">Change password</h1><PasswordForm /></div>);
}

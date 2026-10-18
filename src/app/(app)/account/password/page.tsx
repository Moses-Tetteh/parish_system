import { requireUser } from "@/lib/auth/session";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "Change Password" };

export default async function Page() {
  await requireUser();
  return (
    <>
      <h1>Change Password</h1>
      <PasswordForm />
    </>
  );
}

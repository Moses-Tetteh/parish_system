import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getParishSettings } from "@/lib/settings";
import { AppFooter } from "@/components/AppFooter";
import { RosaryDivider } from "@/components/icons";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log In" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next, expired } = await searchParams;
  const { slogan } = await getParishSettings();
  return (
    <div className="login-page">
      <main className="login-inner">
        <div className="login-wrap">
          <div className="login-seal">
            <img src="/assets/images/logo.png" alt="Blessed Clementina Catholic Church seal" width={84} height={84} />
          </div>
          <h2>Blessed Clementina Parish</h2>
          <p className="tagline">Sacraments Register</p>
          {slogan.length > 0 && <p className="login-slogan">{slogan.map((l, i) => <span key={i}>{l}<br /></span>)}</p>}
          {expired !== undefined && <div className="flash flash-info" role="status">Your session expired. Please log in again.</div>}
          <LoginForm next={typeof next === "string" ? next : ""} />
          <RosaryDivider count={7} style={{ margin: "18px 0 12px" }} />
          <p className="hint" style={{ margin: 0 }}>Authorised parish staff only. Activity is logged.</p>
        </div>
        <AppFooter />
      </main>
    </div>
  );
}

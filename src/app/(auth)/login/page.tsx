import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-brand-700 text-2xl text-white" aria-hidden>✝</div>
          <h1 className="text-xl font-bold">Blessed Clementina Parish</h1>
          <p className="text-sm text-slate-600">Sacramental Registers</p>
        </div>
        <div className="card"><LoginForm next={typeof next === "string" ? next : ""} /></div>
        <p className="mt-4 text-center text-xs text-slate-500">Authorised parish staff only. Activity is logged.</p>
      </div>
    </main>
  );
}

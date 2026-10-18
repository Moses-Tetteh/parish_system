import Link from "next/link";

export const metadata = { title: "No permission" };

export default function Forbidden() {
  return (
    <main className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-2xl font-bold">You don’t have permission to open that page</h1>
      <p className="mt-3 text-slate-600">Your role does not include this area. If you think this is a mistake, ask the parish administrator.</p>
      <Link href="/dashboard" className="btn-primary mt-6">Back to the dashboard</Link>
    </main>
  );
}

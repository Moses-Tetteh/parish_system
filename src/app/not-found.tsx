import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/dashboard" className="btn-primary mt-6">Back to the dashboard</Link>
    </main>
  );
}

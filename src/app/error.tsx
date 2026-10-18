"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-slate-600">Your data was not lost. Please try again; if it keeps happening, tell the administrator.</p>
      {error.digest && <p className="mt-2 text-xs text-slate-400">Reference: {error.digest}</p>}
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </main>
  );
}

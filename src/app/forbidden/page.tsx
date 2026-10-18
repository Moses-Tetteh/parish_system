import Link from "next/link";
import { AppFooter } from "@/components/AppFooter";

export const metadata = { title: "No permission" };
export const dynamic = "force-dynamic";

export default function Forbidden() {
  return (
    <>
      <main className="container" style={{ maxWidth: 560, textAlign: "center", paddingTop: 80 }}>
        <div className="card">
          <h1>You don&rsquo;t have permission to open that page</h1>
          <p className="hint">Your role does not include this area. If you think this is a mistake, ask the parish administrator.</p>
          <p style={{ marginTop: 18 }}><Link href="/dashboard" className="btn">Back to the dashboard</Link></p>
        </div>
      </main>
      <AppFooter />
    </>
  );
}

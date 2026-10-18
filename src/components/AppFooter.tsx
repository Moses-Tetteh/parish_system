import { APP_NAME, APP_VERSION } from "@/lib/app-info";
import { getParishSettings } from "@/lib/settings";

export async function AppFooter() {
  const s = await getParishSettings();
  return (
    <footer className="app-footer">
      {s.slogan.length > 0 && <div className="footer-slogan">{s.slogan.join(" · ")}</div>}
      {s.address && <div className="footer-address">{s.address}</div>}
      <div>{APP_NAME} · v{APP_VERSION}</div>
    </footer>
  );
}

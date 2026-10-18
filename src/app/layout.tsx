import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/app-info";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s — ${APP_NAME}` },
  description: "Sacramental registers and parish administration",
  robots: { index: false, follow: false },
  icons: { icon: "/assets/images/logo.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#6e1423" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

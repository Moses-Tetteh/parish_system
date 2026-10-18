import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // mysql2 / bcryptjs must stay server-side only.
  serverExternalPackages: ["mysql2", "bcryptjs"],
  experimental: {
    // Server Actions already verify Origin vs Host; extra origins (e.g. a LAN
    // hostname) can be whitelisted via ALLOWED_ORIGINS="host1,host2".
    serverActions: {
      bodySizeLimit: "6mb",
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
    },
  },
};

export default config;

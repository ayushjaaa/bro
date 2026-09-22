import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Baseline hardening for every response. The admin panel is the highest-privilege app (it approves
  // customers), so it must never be embeddable in another site's <iframe> -- otherwise a page an admin
  // visits could overlay invisible frames and trick them into clicking Approve / Reject (clickjacking).
  // `frame-ancestors 'none'` is the modern control; X-Frame-Options covers older browsers. A full
  // script-src CSP is deliberately not set here (needs per-request nonces; separate, tested work).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=()" },
          // R-1: admin-panel is the highest-privilege app (it approves customers, holds every
          // Shopify/Supabase secret) -- HSTS here matters at least as much as on the storefront
          // (which already has it), so a downgrade/SSL-stripping attempt against the admin login
          // flow can't force a plain-HTTP connection.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next"
import { ALLOWED_IMAGE_HOSTS } from "./src/lib/image-hosts"

/**
 * Phase 10 hardening — Spec §18 Security & Privacy.
 *
 * Conservative security headers. CSP is deliberately NOT set here: Stripe
 * Checkout, Cloudinary signed uploads, and next/script blocks each need
 * their own `script-src` / `frame-src` allowances that are easy to get
 * wrong and break checkout. Add a strict CSP behind a flag when you have
 * time to test every paid-course flow end-to-end.
 */
const securityHeaders = [
  // Disable MIME sniffing so a content-type mismatch can't be used to
  // execute user-uploaded files as script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Clickjacking defence. `SAMEORIGIN` lets your own (admin) UIs embed
  // previews; it blocks cross-origin iframing of the app.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },

  // Don't leak the full URL (which can contain query params, course slugs)
  // to third parties the user clicks through to.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Turn off powerful APIs we don't use. Add entries here if a page needs
  // camera/mic/geolocation (none do as of Phase 10).
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
    ].join(", "),
  },

  // 1 year HSTS with preload — Vercel / Netlify already terminate TLS so
  // the header is safe to ship. If you run behind a plain-HTTP local
  // proxy for dev, strip this in NODE_ENV=development (Next.js does not
  // serve headers from this config in dev unless you configure it to).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
]

const nextConfig: NextConfig = {
  images: {
    // Single source of truth — see src/lib/image-hosts.ts. Adding a host
    // there automatically extends both Next's image optimisation AND the
    // server-side thumbnail validation in /api/courses/[id].
    remotePatterns: ALLOWED_IMAGE_HOSTS.map((h) => ({
      protocol: "https" as const,
      hostname: h.hostname,
    })),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig

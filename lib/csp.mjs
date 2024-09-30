import { DATA, getCSP, SELF, UNSAFE_EVAL, UNSAFE_INLINE } from "csp-header";

const clerk_url =
  "https://witty-bedbug-40.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

const basePreset = {
  "script-src": [SELF, clerk_url],
  "connect-src": [SELF],
  "default-src": [SELF],
  "style-src": [SELF],
  "font-src": [SELF],
  "object-src": [SELF],
  "img-src": ["*", DATA],
  "frame-ancestors": [SELF],
  "child-src": [SELF],
  "frame-src": [SELF],
  "base-uri": [SELF],
  "form-action": [SELF],
};

const sitePreset = {
  ...basePreset,
  "script-src": [UNSAFE_EVAL, UNSAFE_INLINE, SELF, clerk_url],
  "connect-src": [SELF, "https://vitals.vercel-insights.com"],
  "style-src": [UNSAFE_INLINE, SELF, "fonts.googleapis.com"],
  "font-src": [SELF, "fonts.gstatic.com"],
};

export const csp = getCSP({ presets: [sitePreset] });

export const securityHeaders = [
  // {
  //   key: "Content-Security-Policy",
  //   value: csp,
  // },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

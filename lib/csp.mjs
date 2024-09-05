import { DATA, getCSP, SELF, UNSAFE_EVAL, UNSAFE_INLINE } from "csp-header";

const isDev = process.env.NODE_ENV === "development";

const sitePreset = {
  "default-src": [SELF],
  "script-src": isDev ? [UNSAFE_EVAL, UNSAFE_INLINE, SELF] : [SELF],
  ...(isDev ? {} : { "connect-src": [SELF, "https://vitals.vercel-insights.com"] }),
  "style-src": [UNSAFE_INLINE, SELF, "fonts.googleapis.com"],
  "font-src": [SELF, "fonts.gstatic.com"],
  "object-src": [SELF],
  "img-src": ["*", DATA],
  "frame-ancestors": [SELF],
  "child-src": [SELF],
  "frame-src": [SELF],
  "base-uri": [SELF],
  "form-action": [SELF],
};

const csp = getCSP({ presets: [sitePreset] });

export const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
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
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

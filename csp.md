## Content Security Policy (CSP)

This application implements a robust Content Security Policy to enhance security by controlling which resources can be loaded and executed. The CSP is defined in `lib/csp.mjs` and is automatically applied to all pages.

### Key Features

- **Dynamic Configuration**: The CSP adapts based on the environment (development vs. production).
- **Strict Default Policy**: By default, resources are only allowed from the same origin (`'self'`).
- **Development Flexibility**: In development mode, inline scripts and `eval()` are allowed for better debugging.
- **Production Security**: Stricter rules are applied in production, enhancing security.

### CSP Directives

The following directives are implemented:

- `default-src`: Restricts to `'self'` (same origin).
- `script-src`:
  - Development: Allows `'unsafe-eval'`, `'unsafe-inline'`, and `'self'`.
  - Production: Restricts to `'self'`.
- `connect-src`:
  - Production: Allows `'self'` and Vercel Analytics.
- `style-src`: Allows inline styles, `'self'`, and Google Fonts.
- `font-src`: Allows `'self'` and Google Fonts.
- `object-src`: Restricts to `'self'`.
- `img-src`: Allows all sources (`*`) and data URIs.
- `frame-ancestors`: Restricts to `'self'`.
- `child-src` and `frame-src`: Restrict to `'self'`.
- `base-uri`: Restricts to `'self'`.
- `form-action`: Restricts to `'self'`.

### Additional Security Headers

The application also sets the following security headers:

- `Referrer-Policy`: Set to `strict-origin-when-cross-origin`.
- `X-Frame-Options`: Set to `DENY`.
- `X-XSS-Protection`: Enabled with `mode=block`.
- `X-Content-Type-Options`: Set to `nosniff`.
- `X-DNS-Prefetch-Control`: Enabled.
- `Strict-Transport-Security`: Enforces HTTPS with a max age of 1 year.
- `Permissions-Policy`: Restricts access to camera, microphone, and geolocation.

These policies and headers work together to provide a secure browsing experience and protect against various web vulnerabilities.

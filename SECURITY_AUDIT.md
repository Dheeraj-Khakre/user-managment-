# Security Audit

**Review date:** 2026-10-31  
**Scope:** Frontend implementation and reviewed API integration. This is a code-level review, not a penetration test or a claim that the application is secure against every attack.

## Measures Implemented

- Access tokens are held in JavaScript module memory only. The frontend does not persist access tokens, refresh tokens, passwords, or MFA secrets in local or session storage. The only persisted browser preference is the color theme.
- Requests use the backend's HttpOnly refresh cookie with `credentials: include`; access tokens are attached as bearer headers. Refresh is single-flight, protected requests retry once after refresh, and logout clears in-memory state.
- The centralized API client applies a timeout, validates response envelopes and sensitive user/stat/MFA payloads, and replaces server 5xx messages with a generic user-facing error. The client does not log tokens or response bodies.
- Production API URLs are required to use HTTPS except for localhost. Production deployment still needs TLS and server-side headers.
- User-provided text is rendered through React's normal escaped text handling. No `eval`, unsafe HTML rendering, or dynamic HTML insertion is used.
- Routes and actions are gated by authenticated user/role state for usability. These checks are not treated as authorization; the backend remains the enforcement point.
- Forms validate lengths, email shape, password policy, confirmation, and MFA code format before submission. Backend validation remains authoritative.
- Destructive user deletion is a confirmed soft delete. The dialog supports Escape and initial keyboard focus. A render error boundary avoids displaying exception details.
- Frontend dependency audit reports zero known vulnerabilities after upgrading React Router to the patched v7 release.

## Findings and Fixes

### Critical: Password reset token disclosed by API

`POST /api/v1/auth/forgot-password` returns the raw reset token in the response for an existing account. An unauthenticated requester can obtain a token for a victim and reset that account's password. The frontend displays only a generic confirmation and never renders the token, but the token is still present in the browser's network response and cannot be made safe by frontend code.

**Frontend action:** The response token is ignored and not shown or logged. The reset form accepts a token from a secure out-of-band link.  
**Required backend action:** Do not return reset tokens from the API. Deliver a single-use, short-lived reset link through a verified out-of-band channel; keep response behavior indistinguishable for known and unknown accounts. The backend currently has no email-delivery implementation, so end-to-end password recovery is not production-ready.

### Moderate: CSP permits inline scripts

The API's Helmet configuration includes `'unsafe-inline'` in `script-src`, weakening the CSP's XSS protections. The Vite frontend also loads Google Fonts from external origins, which requires explicit production CSP allowances or locally hosted fonts.

**Required deployment action:** Configure a frontend/reverse-proxy CSP with a nonce or hash-based script policy where practical, and explicitly decide whether to self-host the fonts or allow only the required font origins. Do not copy the development policy unchanged into production.

### Moderate: No explicit CSRF token/Origin validation

Refresh and logout use the refresh cookie. `SameSite=Lax` and the backend CORS allowlist provide some mitigation, but CORS is not a general CSRF defense and the API has no explicit CSRF token or Origin validation. The frontend's `X-Requested-With` header is not a CSRF token.

**Required backend action:** Review the deployment's site boundaries and add appropriate CSRF protection or strict Origin/Referer validation for cookie-authenticated state-changing endpoints. Keep cookie `Secure`, `HttpOnly`, and `SameSite` settings appropriate to the deployment.

### Low: Operational information in public health response

The public health endpoint returns environment and process memory details. Restrict or minimize these fields if the API is exposed to untrusted networks.

### Configuration: Example secrets and CORS

The backend `.env.example` contains known placeholder JWT and cookie secrets. They must never be used in a deployed environment. Production `CORS_ORIGIN` must be restricted to the exact frontend origin; the Vite proxy's Origin adjustment applies only to local development.

## Remaining Risks

- Password reset is blocked from being a complete production workflow until the backend stops returning the token and provides secure delivery.
- The frontend cannot prevent XSS from reading an in-memory access token while malicious script is executing. Keep dependencies patched, deploy an effective CSP, avoid unsafe HTML, and review all future rendering integrations.
- Production TLS, CSP, HSTS, cookie behavior, CORS allowlisting, and security headers depend on the backend/reverse-proxy deployment and were not changed in this frontend phase.
- The backend uses `SameSite=Lax` refresh cookies and has no explicit CSRF token. Cross-site and same-site-subdomain deployment cases need review.
- No frontend lint or automated component-test scripts exist yet. Browser checks in this phase exercised sign-in/session restore, admin stats, user creation/update/soft-delete, profile update, sign-out, route protection, validation, and 390 px/desktop layouts. MFA code verification and password changes were not exercised in the browser; backend tests cover the corresponding service/API behavior.
- No manual penetration test was performed. `npm audit` is a dependency advisory scan, not a security certification.

## Recommended Backend Improvements

1. Remove raw password-reset tokens from responses and add a trusted email delivery flow with generic responses, rate limits, single-use tokens, and audit events.
2. Replace inline-script CSP allowances with a strict production policy; review Swagger UI's requirements separately from the frontend policy.
3. Add CSRF defenses or strict Origin checks to cookie-authenticated state-changing endpoints.
4. Minimize public health data and ensure production CORS origins are explicit and credential-safe.
5. Replace all placeholder signing/cookie values with generated, rotated secrets from a secret manager; never promote `.env.example` values.

## Manual Penetration-Test Recommendations

- Attempt reset-token theft and account takeover before and after the backend fix; verify generic responses for known/unknown emails and token single-use/expiry.
- Test CSRF against refresh/logout from unrelated origins and same-site sibling subdomains; verify CORS and Origin checks independently.
- Test horizontal and vertical authorization across every user route, including identifier tampering, role/status updates, self-demotion, and soft/hard deletion.
- Test access-token expiry, refresh rotation, replay detection, logout invalidation, password-change revocation, suspended users, and MFA challenge expiry.
- Test stored/reflected XSS using names, bios, validation messages, and API error content; verify CSP behavior and third-party font policy.
- Verify production HTTPS redirects, HSTS, cookie flags, framing protections, MIME protections, CORS allowlisting, and absence of stack traces or secrets in responses and logs.
# End-to-End Test Report

**Run date:** 2026-10-31

## Summary

An earlier API E2E run exposed a stale expectation that forgot-password would return a reset token. The API intentionally never returns reset tokens in HTTP responses. The runner now checks token non-disclosure and leaves one-time reset-token behavior to isolated integration tests, where a hashed test fixture can be created safely without assuming access to the target server's database. Temporary E2E users are removed even when a check fails.

## Results

| Area | Result |
|---|---|
| Backend unit and integration suite | **Passed: 58/58 tests** |
| API E2E runner | **Passed: 24 checks** |
| Frontend TypeScript check and production build | **Passed** |
| GitHub Actions | **Configured:** backend tests, API E2E against seeded temporary SQLite data, and frontend production build; hosted workflow run is pending |
| Admin browser flow | **Passed:** login, dashboard metrics, directory, create account, change role/status, deactivate, and confirm the account no longer appears in search |
| Standard-user browser flow | **Passed:** profile update and restore; directory navigation hidden; direct directory URL redirected to the restricted-access page |
| API session flow | **Passed:** registration, login, refresh rotation, logout, and refresh-token replay rejection |
| Docker Compose runtime | **Passed:** API and frontend healthy; frontend served successfully and API E2E checks ran against the Compose API |

The API E2E runner also checks health, invalid credentials, authenticated profile access, role-based denial/allowance for admin statistics, password validation, admin user management, forgot-password response privacy, refresh-token rotation/replay, and step-up password verification/change. Integration tests cover password-reset token use and replay, step-up OTP validation/replay, and MFA setup and verification.

## Remaining verification limits

- **Email delivery:** SMTP was not configured. Generic forgot-password behavior and OTP password fallback were verified; sending and consuming a real email code/reset link still require SMTP credentials.
- **Browser security pages:** Production build and authenticated route rendering were checked; live inbox OTP delivery and completing an MFA authenticator enrollment were not available without SMTP/interactive TOTP setup.
- **Test credentials:** The seeded admin account listed in the README is for local development only. Do not use the published seed credentials in a deployed environment.

## Running the checks

Start the backend with the local seeded accounts available, then run:

```powershell
npm test
npm run test:e2e
```

In another terminal, start the frontend with `npm.cmd --prefix frontend run dev` and open `http://localhost:5173` to verify the browser flows. Run these checks only against a local or disposable test database.

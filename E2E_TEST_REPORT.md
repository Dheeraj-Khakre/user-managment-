# End-to-End Test Report

**Run date:** 2026-10-31

## Summary

The first API end-to-end run stopped at password recovery. The test expected the forgot-password response to contain a reset token, but the API deliberately does not return tokens in HTTP responses. With no SMTP server configured locally, no reset email was delivered either. This was a stale test expectation, not a password-reset API failure.

The E2E runner now checks that the response does not expose a token, creates a one-time hashed token for its temporary test user, and then exercises password reset, login with the new password, and token replay rejection. It also deletes its temporary users and no longer changes the seeded user's profile or password.

## Results

| Area | Result |
|---|---|
| Backend unit and integration suite | **Passed: 56/56 tests** |
| API E2E runner | **Passed: 23 checks** |
| Frontend TypeScript check and production build | **Passed** |
| GitHub Actions | **Configured:** backend tests, API E2E against seeded temporary SQLite data, and frontend production build; hosted workflow run is pending |
| Admin browser flow | **Passed:** login, dashboard metrics, directory, create account, change role/status, deactivate, and confirm the account no longer appears in search |
| Standard-user browser flow | **Passed:** profile update and restore; directory navigation hidden; direct directory URL redirected to the restricted-access page |
| API session flow | **Passed:** registration, login, refresh rotation, logout, and refresh-token replay rejection |
| Docker Compose runtime | **Not run:** Docker Desktop's engine was unavailable in the test environment |

The API E2E runner also checks health, invalid credentials, authenticated profile access, role-based denial/allowance for admin statistics, password validation, admin user management, forgot-password response privacy, one-time password reset, and login with the reset password. GitHub Actions seeds a temporary database and runs this API E2E runner as part of CI.

## Remaining verification limits

- **Email delivery:** SMTP was not configured. The forgot-password endpoint's generic response and token non-disclosure were verified, but inbox delivery and clicking a real reset link were not. The reset endpoint itself and single-use behavior were tested using a test-only token fixture.
- **Container startup:** Compose configuration was validated previously, but images and container-to-container behavior could not be exercised without a running Docker engine.
- **Test credentials:** The seeded admin account listed in the README is for local development only. Do not use the published seed credentials in a deployed environment.

## Running the checks

Start the backend with the local seeded accounts available, then run:

```powershell
npm test
npm run test:e2e
```

In another terminal, start the frontend with `npm.cmd --prefix frontend run dev` and open `http://localhost:5173` to verify the browser flows. Run these checks only against a local or disposable test database.

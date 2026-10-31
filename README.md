# 🛡️ Enterprise Node.js Express User Management & Authentication API

A secure, production-ready RESTful backend built with **Node.js** and **Express.js** providing end-to-end security, JSON Web Token (JWT) authentication, refresh token rotation with replay detection, Multi-Factor Authentication (MFA / TOTP), brute-force account lockout, Role-Based Access Control (RBAC), **Swagger UI** interactive documentation, embedded **SQLite Database**, and a full **Unit and Integration Testing Suite**.

---

## 📋 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [End-to-End Security Architecture](#-end-to-end-security-architecture)
- [Tech Stack](#-tech-stack)
- [Interactive Swagger UI Documentation](#-interactive-swagger-ui-documentation)
- [Database Architecture (SQLite)](#-database-architecture-sqlite)
- [Project Directory Structure](#-project-directory-structure)
- [Node.js Virtual Environment & Isolation](#-nodejs-virtual-environment--isolation)
- [Quick Start Guide](#-quick-start-guide)
- [Default Seeded Credentials](#-default-seeded-credentials)
- [Role-Based Access Control (RBAC) Matrix](#-role-based-access-control-rbac-matrix)
- [Multi-Factor Authentication (MFA / TOTP) Workflow](#-multi-factor-authentication-mfa--totp-workflow)
- [Account Lockout Mechanism](#-account-lockout-mechanism)
- [Automated Testing & Security Validation](#-automated-testing--security-validation)
  - [Unit Testing Suite](#1-unit-testing-suite)
  - [Integration & Security Testing Suite](#2-integration--security-testing-suite)
  - [Detailed Security Test Scenarios](#3-detailed-security-test-scenarios)
- [API Reference Overview](#-api-reference-overview)
- [cURL Request Examples](#-curl-request-examples)
- [Production Readiness Checklist](#-production-readiness-checklist)
- [Git Version Control](#-git-version-control)

---

## 🏛 Architectural Overview

The application follows the **Layered Architectural Pattern** (Separation of Concerns):

```
Client Requests / Swagger UI
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Security Layer (Helmet, CORS, Rate Limiting, HPP)     │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Routing & Validation Layer (Zod Schemas)              │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Auth & RBAC Guards (JWT Verification & Role Checks)   │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Controllers Layer (Request / Response Orchestration)  │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Service Layer (Business Logic, MFA, Cryptography)     │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Repository Layer (SQLite via node:sqlite / Prepared)  │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Embedded SQLite Database (data/app.db or :memory:)    │
└────────────────────────────────────────────────────────┘
```

1. **Routing Layer (`src/routes/`)**: Mounts versioned URL endpoints and applies endpoint-specific middlewares.
2. **Middleware Layer (`src/middlewares/`)**: Executes authentication, RBAC authorization, request validation, rate limiting, and centralized error handling.
3. **Controller Layer (`src/controllers/`)**: Translates HTTP requests to service calls and structures HTTP responses using standard API schemas (`ApiResponse`).
4. **Service Layer (`src/services/`)**: Encapsulates business logic, cryptographic hashing, MFA/TOTP computation, JWT signing/rotation, and validation rules.
5. **Repository Layer (`src/repositories/`)**: Data persistence layer using **SQLite prepared statements**, guaranteeing complete immunity against SQL injection.

---

## 🔒 End-to-End Security Architecture

| Security Domain | Implementation | Security Benefit |
| :--- | :--- | :--- |
| **HTTP Security Headers** | `helmet` | Defends against Cross-Site Scripting (XSS), Clickjacking (`X-Frame-Options`), MIME-sniffing, and enforces Strict Transport Security (HSTS). |
| **CORS Policy** | `cors` with origin whitelisting | Prevents unauthorized cross-origin requests while enabling credentialed requests (`credentials: true`) for frontend single-page apps. |
| **Brute-Force & DoS Defense** | `express-rate-limit` | Tiered rate limiting: 100 requests / 15 min for general API, and a strict 15 requests / 15 min for authentication routes. |
| **Account Lockout Protection** | Progressive failed attempts ledger | Locks the user account for 15 minutes after 5 consecutive failed login attempts to thwart credential stuffing and brute-force attacks. |
| **Multi-Factor Authentication** | RFC 6238 TOTP (`src/utils/totp.js`) | Time-based one-time password challenge using authenticator apps (Google Authenticator, Authy). Two-step login challenge. |
| **Parameter Pollution** | `hpp` | Mitigates HTTP Parameter Pollution attacks where attackers duplicate query parameters to bypass checks. |
| **Input Validation** | `zod` (`4.x`) | Enforces runtime schema validation and strict type casting on `body`, `query`, and `params`. Rejects unexpected or malicious payloads. |
| **Password Hashing** | `bcryptjs` (Cost factor 12) | Irreversible salted password hashing resisting rainbow tables and GPU brute-force attacks. |
| **Password Strength** | Regex & Zod | Requires $\ge 8$ chars, uppercase letter, lowercase letter, numeric digit, and special symbol. |
| **JWT Access Tokens** | Short-lived (15 minutes) | Signed with 256-bit secret. Limits the exposure window if a client-side access token is intercepted. |
| **JWT Refresh Tokens** | Long-lived (7 days) in `HttpOnly` cookie | Stored in `HttpOnly`, `SameSite: Lax`, and `Secure` cookies inaccessible to JavaScript, protecting against XSS token theft. |
| **Refresh Token Rotation & Replay Detection** | Token Family ID & SHA-256 Fingerprinting | Refresh tokens can only be used once. If an already-used refresh token is presented (indicating theft), the entire token family is immediately revoked. |
| **Database Injection Protection** | SQLite Prepared Statements | Prepared parameterized queries (`prepare().run()` / `prepare().get()`) eliminate SQL Injection vulnerabilities. |
| **Exception & Information Leakage** | Centralized `ApiError` & Error Middleware | Distinguishes operational errors from programming bugs. Error stack traces are stripped in production to prevent leakage of internal system details. |
| **Privilege Escalation Guards** | RBAC & Ownership Middlewares | Protects against both Horizontal Privilege Escalation (User A accessing User B's data) and Vertical Privilege Escalation (Normal User accessing Admin routes). |

---

## 🧰 Tech Stack

- **Runtime**: Node.js (`>= 20.0.0`, tested on `v26.13.0`)
- **Framework**: Express.js (`4.21.x`)
- **Database**: SQLite (`node:sqlite` Native Embedded Engine)
- **API Documentation**: Swagger UI Express (`OpenAPI 3.0.3`)
- **Authentication**: `jsonwebtoken` (JWT), `bcryptjs`, RFC 6238 TOTP MFA
- **Validation**: `zod` (`4.x`)
- **Security**: `helmet`, `cors`, `express-rate-limit`, `hpp`, `cookie-parser`
- **Testing**: Node Native Test Runner (`node:test`, `node:assert`), `supertest`
- **Logging**: `winston` (persistent JSON file logs + color console), `morgan` (HTTP access logging)

---

## 📖 Interactive Swagger UI Documentation

The backend includes a fully interactive Swagger UI for testing all API endpoints in the browser:

- **Swagger Documentation URL**: `http://localhost:5000/api-docs`
- **Alternative Redirect**: `http://localhost:5000/docs`
- **Raw OpenAPI JSON**: `http://localhost:5000/api-docs.json`

### Authentication in Swagger UI:
1. Click the **Authorize** button in Swagger UI.
2. For Bearer authentication, enter `Bearer <YOUR_ACCESS_TOKEN>`.
3. Test endpoints with live requests, schemas, and response validation!

---

## 💾 Database Architecture (SQLite)

The application uses **SQLite** through Node.js's built-in `node:sqlite` (`DatabaseSync`):

- **Location**: `data/app.db` in persistent modes, `:memory:` during automated test runs.
- **Concurrency & Speed**: Configured with `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) and `PRAGMA foreign_keys = ON;`.
- **Relational Integrity**: Foreign key constraints enforce user session ownership on the `tokens` table (`ON DELETE CASCADE`).
- **Security**: 100% prepared statements for all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations.

---

## 📁 Project Directory Structure

```
dhee.work/
├── .env                  # Active environment variables (git-ignored)
├── .env.example          # Template for environment configuration
├── .gitignore            # Git exclusion rules
├── .node-version         # Node version lock for version managers
├── .nvmrc                # NVM version configuration
├── package.json          # Project manifest and npm test scripts
├── README.md             # Explanatory architectural documentation
│
├── data/                 # SQLite database storage
│   ├── .gitkeep
│   └── app.db            # Persistent SQLite database file
│
├── logs/                 # Winston system logs
│   ├── combined.log
│   └── error.log
│
├── scripts/
│   ├── activate.ps1      # Windows PowerShell virtual environment activator
│   ├── activate.sh       # Unix/Linux/macOS Bash virtual environment activator
│   ├── seed.js           # Database seeder with Admin, Moderator, User accounts
│   ├── setup.ps1         # Windows one-click automated setup script
│   └── test-api.js       # Standalone end-to-end API test script
│
├── src/
│   ├── app.js            # Express app, security pipeline & Swagger UI
│   ├── server.js         # HTTP server entrypoint & graceful shutdown
│   │
│   ├── config/
│   │   ├── env.config.js    # Strict environment variable validation
│   │   └── logger.config.js # Winston logger setup
│   │
│   ├── constants/
│   │   ├── httpStatusCodes.js # HTTP status codes
│   │   └── roles.js           # RBAC role definitions (ADMIN, MODERATOR, USER)
│   │
│   ├── controllers/
│   │   ├── auth.controller.js # Auth, MFA, token rotation, password resets
│   │   └── user.controller.js # Profile updates, admin CRUD, statistics
│   │
│   ├── db/
│   │   └── sqlite.js          # SQLite connection, WAL mode & migrations
│   │
│   ├── docs/
│   │   └── swagger.js         # OpenAPI 3.0.3 specification & Swagger UI
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js          # JWT bearer & cookie extractor
│   │   ├── error.middleware.js         # Centralized error & 404 handler
│   │   ├── rateLimiter.middleware.js   # Global and auth rate limiters
│   │   ├── rbac.middleware.js          # Role-Based Access Control guards
│   │   ├── requestLogger.middleware.js # Morgan to Winston stream
│   │   └── validate.middleware.js      # Zod schema validation middleware
│   │
│   ├── repositories/
│   │   ├── token.repository.js # SQLite token ledger & replay tracking
│   │   └── user.repository.js  # SQLite user DAO with prepared queries
│   │
│   ├── routes/
│   │   ├── auth.routes.js   # /api/v1/auth/*
│   │   ├── health.routes.js # /api/v1/health
│   │   ├── index.js         # Versioned route router
│   │   └── user.routes.js   # /api/v1/users/*
│   │
│   ├── services/
│   │   ├── auth.service.js  # Authentication, lockout, MFA & reset logic
│   │   ├── token.service.js # Cryptographic JWT handling & token rotation
│   │   └── user.service.js  # User lifecycle & administrative operations
│   │
│   ├── utils/
│   │   ├── ApiError.js      # Standard operational error class
│   │   ├── ApiResponse.js   # Uniform JSON response structure
│   │   ├── asyncHandler.js  # Async route wrapper
│   │   ├── logger.js        # Winston logging instance
│   │   └── totp.js          # RFC 6238 TOTP algorithm implementation
│   │
│   └── validators/
│       ├── auth.validator.js # Zod schemas for auth & MFA endpoints
│       └── user.validator.js # Zod schemas for user management endpoints
│
└── tests/
    ├── integration/
    │   └── authentication-security.test.js # End-to-end security integration suite (29 tests)
    └── unit/
        ├── account-lockout.unit.test.js    # Account lockout unit tests (3 tests)
        ├── password-validation.unit.test.js # Weak password rules unit tests (6 tests)
        ├── token.service.unit.test.js      # JWT & session timeout unit tests (4 tests)
        └── totp.unit.test.js               # TOTP calculation & drift unit tests (6 tests)
```

---

## 🐍 Node.js Virtual Environment & Isolation

Activate the isolated project virtual environment:

### Windows (PowerShell)
```powershell
. .\scripts\activate.ps1
```
- Adds Node and local `node_modules/.bin` to the active session `PATH`.
- Validates your `.env` configuration.
- Prefixes your command prompt with `(node-venv)`.
- Deactivate at any time using `deactivate-node`.

### macOS / Linux (Bash or Zsh)
```bash
source ./scripts/activate.sh
```

---

## 🚀 Quick Start Guide

### 1. Install & Configure
```bash
# Clone and enter directory
cd C:\Dheeraj-workSpace\dhee.work

# Copy environment variables
copy .env.example .env

# Install dependencies
npm install

# Seed default database accounts (Admin, Moderator, User)
npm run seed
```

### 2. Start Server
```bash
# Start in development mode with nodemon auto-reloading:
npm run dev

# Or start in standard production mode:
npm start
```

Visit **`http://localhost:5000/api-docs`** in your browser to interact with the API!

### Run the frontend and backend with Docker Compose

Install Docker Desktop, then from the repository root create the local environment file and start both services. Compose seeds the default accounts before starting the API:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open **`http://localhost:5173`** for the frontend or **`http://localhost:5000/api-docs`** for the API documentation. The SQLite database is persisted in a Docker volume. Stop the services with **Ctrl+C**; run `docker compose down` to remove the containers while keeping the database volume.

The GitHub Actions workflow runs the backend tests and builds the frontend on pushes and pull requests. It does not deploy or publish images.

---

## 👥 Default Seeded Credentials

| Role | Email | Password | Privileges |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | `admin@example.com` | `Admin@SecurePassword123!` | Full user CRUD, role updates, statistics dashboard, user deletion. |
| **`MODERATOR`** | `moderator@example.com` | `Moderator@SecurePassword123!` | Read access to all user profiles, audit user listings. |
| **`USER`** | `user@example.com` | `User@SecurePassword123!` | Standard privileges: manage own profile, MFA, change password. |

---

## 🔒 Security Settings and Step-Up Verification

The UI separates **Security settings**, **Change password**, and **Multi-factor authentication** into distinct pages. Opening either sensitive page starts a fresh, purpose-scoped identity check:

- When SMTP is configured and the account email is verified, a 6-digit code is sent to that email. Codes expire in 10 minutes, can be used once, allow at most five attempts, and can be resent once per minute.
- If email delivery is unavailable, the user can verify with their current password. This fallback is also available as an explicit choice when email OTP is available.
- A successful check issues a five-minute token scoped to either password changes or MFA management. The API requires this token for password and MFA changes; direct API calls cannot bypass the UI check.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and any required `SMTP_USER`/`SMTP_PASS` values in `.env` to enable email codes. Without SMTP or a verified email, the UI clearly asks for the current password instead.

## 🔐 Multi-Factor Authentication (MFA / TOTP) Workflow

1. **Initiate Setup (`POST /api/v1/auth/mfa/setup`)**:
   - Authenticated user calls endpoint.
   - Server generates a cryptographically random RFC 4648 Base32 secret.
   - Server returns the secret and an `otpauth://totp/...` URI.

2. **Verify & Enable (`POST /api/v1/auth/mfa/verify`)**:
   - User inputs 6-digit code from their authenticator app (Google Authenticator / Authy).
   - Server verifies code with time drift window ($\pm 30s$).
   - Upon confirmation, sets `mfaEnabled = 1` in SQLite database.

3. **Two-Step Login Challenge**:
   - **Step 1 (`POST /api/v1/auth/login`)**:
     - User submits email and password.
     - Server recognizes `mfaEnabled = 1`.
     - Server returns `{ mfaRequired: true, mfaToken: '<tempToken>' }` (valid for 5 minutes). No session tokens are issued yet.
   - **Step 2 (`POST /api/v1/auth/mfa/login-step2`)**:
     - Client submits `mfaToken` + 6-digit `code`.
     - Server verifies code.
     - Server issues final `accessToken` and sets HttpOnly `refreshToken` cookie.

4. **Disable MFA (`POST /api/v1/auth/mfa/disable`)**:
   - Requires user's current password for confirmation.

---

## 🚫 Account Lockout Mechanism

To protect user accounts from automated credential stuffing and brute-force password guessing:

1. **Attempt Tracking**: Each incorrect password attempt increments `failedLoginAttempts` in SQLite.
2. **Lockout Threshold**: Upon the **5th consecutive failure**, `lockUntil` is set to **15 minutes into the future**.
3. **Lockout Enforcement**:
   - Any login attempt during the lockout period is immediately rejected with:
     ```json
     {
       "success": false,
       "statusCode": 401,
       "message": "Account is temporarily locked due to consecutive failed login attempts. Please try again in 15 minute(s)."
     }
     ```
   - **Even attempts with the CORRECT password are blocked** until the lockout timer expires.
4. **Auto-Recovery**: When the lockout window expires and the user enters the correct password, `failedLoginAttempts` is reset to `0` and `lockUntil` is cleared to `NULL`.

---

## 🛡️ Role-Based Access Control (RBAC) Matrix

| Endpoint | Method | Public | USER | MODERATOR | ADMIN | Description |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `/api-docs` | `GET` | ✅ | ✅ | ✅ | ✅ | Interactive Swagger UI |
| `/api/v1/health` | `GET` | ✅ | ✅ | ✅ | ✅ | System health and memory check |
| `/api/v1/auth/register` | `POST` | ✅ | ✅ | ✅ | ✅ | Register a new user |
| `/api/v1/auth/login` | `POST` | ✅ | ✅ | ✅ | ✅ | Authenticate credentials & issue tokens |
| `/api/v1/auth/mfa/login-step2`| `POST`| ✅ | ✅ | ✅ | ✅ | Step 2 TOTP verification |
| `/api/v1/auth/security/otp` | `POST` | ❌ | ✅ | ✅ | ✅ | Request purpose-scoped email verification code |
| `/api/v1/auth/security/verify` | `POST` | ❌ | ✅ | ✅ | ✅ | Verify email OTP or current password |
| `/api/v1/auth/mfa/setup` | `POST` | ❌ | ✅ | ✅ | ✅ | Generate MFA secret; requires step-up token |
| `/api/v1/auth/mfa/verify`| `POST` | ❌ | ✅ | ✅ | ✅ | Confirm and activate MFA; requires step-up token |
| `/api/v1/auth/mfa/disable`| `POST`| ❌ | ✅ | ✅ | ✅ | Disable MFA; requires step-up token and password |
| `/api/v1/auth/refresh-token` | `POST` | ✅ | ✅ | ✅ | ✅ | Rotate refresh token |
| `/api/v1/auth/logout` | `POST` | ✅ | ✅ | ✅ | ✅ | Revoke refresh token |
| `/api/v1/auth/me` | `GET` | ❌ | ✅ | ✅ | ✅ | View own user profile |
| `/api/v1/auth/change-password`| `POST`| ❌ | ✅ | ✅ | ✅ | Change password; requires step-up token and revokes sessions |
| `/api/v1/users/profile` | `PATCH`| ❌ | ✅ | ✅ | ✅ | Self-service profile update |
| `/api/v1/users` | `GET` | ❌ | ❌ | ✅ | ✅ | List users (pagination, search, filter) |
| `/api/v1/users/:id` | `GET` | ❌ | Self only | ✅ | ✅ | View user by ID |
| `/api/v1/users` | `POST` | ❌ | ❌ | ❌ | ✅ | Admin create user with custom role |
| `/api/v1/users/:id` | `PATCH`| ❌ | ❌ | ❌ | ✅ | Admin update user (role, status) |
| `/api/v1/users/:id` | `DELETE`| ❌ | ❌ | ❌ | ✅ | Admin delete user |
| `/api/v1/users/stats` | `GET` | ❌ | ❌ | ❌ | ✅ | Admin metrics dashboard |

---

## 🧪 Automated Testing & Security Validation

The repository includes an automated unit and integration/security test suite. Run `npm test` for the current total.

### Running Tests

```bash
# Run ALL 48 tests (Unit + Integration):
npm test

# Run only Unit Tests (19 tests):
npm run test:unit

# Run only Integration & Security Tests (29 tests):
npm run test:integration
```

---

### 1. Unit Testing Suite

Located in `tests/unit/`:
- [`totp.unit.test.js`](file:///C:/Dheeraj-workSpace/dhee.work/tests/unit/totp.unit.test.js): Validates base32 secret generation, 6-digit OTP code calculation, time drift window acceptance ($\pm 30s$), and invalid code rejection.
- [`password-validation.unit.test.js`](file:///C:/Dheeraj-workSpace/dhee.work/tests/unit/password-validation.unit.test.js): Validates rejection of weak passwords across 5 distinct deficiency classes.
- [`token.service.unit.test.js`](file:///C:/Dheeraj-workSpace/dhee.work/tests/unit/token.service.unit.test.js): Validates access token signing, session expiration rejection, refresh token rotation, and replay attack family revocation.
- [`account-lockout.unit.test.js`](file:///C:/Dheeraj-workSpace/dhee.work/tests/unit/account-lockout.unit.test.js): Validates sequential attempt counters, lockout window calculation, and counter resets.

---

### 2. Integration & Security Testing Suite

Located in [`tests/integration/authentication-security.test.js`](file:///C:/Dheeraj-workSpace/dhee.work/tests/integration/authentication-security.test.js):
Uses `supertest` to test real HTTP requests, response headers, cookies, rate limiters, and database transactions in isolated SQLite memory.

---

### 3. Detailed Security Test Scenarios

| Test Scenario | Verification Procedure | Expected Outcome |
| :--- | :--- | :--- |
| **Authentication Testing** | Non-existent user email and wrong password requests tested. | Rejected with `401 Unauthorized` and uniform error messaging. |
| **Weak Password Checks** | Registration tested with passwords missing uppercase, lowercase, numbers, special characters, or $<8$ chars. | Rejected with `400 Bad Request` and detailed Zod validation messages. |
| **Brute-Force Rate Limiting** | Rapid authentication attempts sent to `/api/v1/auth/login`. | Throttled with `429 Too Many Requests` when limit is exceeded. |
| **Account Lockout Verification** | 5 consecutive incorrect passwords submitted, followed by 1 attempt with the **CORRECT** password. | Correct password attempt is **blocked** during lockout window with `401 Unauthorized`. |
| **MFA Validation** | Initiates MFA setup, verifies TOTP code, performs 2-step login challenge, and tests invalid OTP rejection. | Step 1 requires `mfaToken`; Step 2 grants access only with valid 6-digit TOTP. |
| **Password Reset Security** | Generates reset token (hashed with SHA-256 in DB), executes reset, and re-submits used token. | Password updated; reused token is **rejected** (single-use enforcement); all existing sessions invalidated. |
| **Session Timeout Testing** | Requests made using an access token expired 10 seconds ago. | Rejected with `401 Unauthorized` (`Access token has expired`). |
| **Horizontal Privilege Escalation** | User A authenticated with their own valid token attempts `GET /api/v1/users/:userB_id` or `PATCH /api/v1/users/:userB_id`. | Rejected with `403 Forbidden` (`You do not have permission to modify or inspect another user's account`). |
| **Vertical Privilege Escalation** | Standard User attempts `GET /api/v1/users/stats`, `POST /api/v1/users`, `DELETE /api/v1/users/:id`, or self-promotion. | Rejected with `403 Forbidden` (`Requires one of the following roles: [ADMIN]`). |

---

## 💻 cURL Request Examples

### 1. Register User
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alex Morgan",
    "email": "alex@example.com",
    "password": "AlexPassword@2026!"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alex@example.com",
    "password": "AlexPassword@2026!"
  }'
```

### 3. Setup MFA
```bash
curl -X POST http://localhost:5000/api/v1/auth/mfa/setup \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### 4. Confirm and Enable MFA
```bash
curl -X POST http://localhost:5000/api/v1/auth/mfa/verify \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"code": "123456"}'
```

### 5. Access Admin Statistics
```bash
curl -X GET http://localhost:5000/api/v1/users/stats \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

---

## 🚢 Production Readiness Checklist

- [x] **Database Persistence**: SQLite database initialized at `data/app.db` with WAL mode and foreign key constraints.
- [x] **Swagger UI**: Interactive OpenAPI documentation active at `/api-docs`.
- [x] **MFA / TOTP**: Multi-Factor Authentication fully implemented per RFC 6238 standard.
- [x] **Brute-Force & Lockout**: 5 failed attempt threshold locks account for 15 minutes.
- [x] **Unit & Integration Testing**: 48 automated test cases covering all security boundaries.
- [x] **Zero Vulnerabilities**: Checked with `npm audit` (0 vulnerabilities found).

---

## 📦 Git Version Control

Commit all changes to git:
```bash
git add .
git commit -m "feat: add Swagger UI, SQLite db integration, MFA TOTP, account lockout, and 48-test security suite"
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

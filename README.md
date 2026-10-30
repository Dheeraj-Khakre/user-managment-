# 🛡️ Enterprise Node.js Express User Management & Authentication API

A secure, production-ready RESTful backend built with **Node.js** and **Express.js** providing end-to-end security, JSON Web Token (JWT) authentication, refresh token rotation with replay detection, Role-Based Access Control (RBAC), input validation via Zod, and full CRUD user management.

---

## 📋 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [End-to-End Security Architecture](#-end-to-end-security-architecture)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [Node.js Virtual Environment & Isolation](#-nodejs-virtual-environment--isolation)
- [Quick Start Guide](#-quick-start-guide)
- [Default Seeded Credentials](#-default-seeded-credentials)
- [Role-Based Access Control (RBAC) Matrix](#-role-based-access-control-rbac-matrix)
- [API Documentation](#-api-documentation)
  - [Health Endpoints](#1-health-check)
  - [Authentication Endpoints](#2-authentication-routes-apiv1auth)
  - [User Management Endpoints](#3-user-management-routes-apiv1users)
- [cURL Request Examples](#-curl-request-examples)
- [Automated Testing](#-automated-testing)
- [Production Readiness Checklist](#-production-readiness-checklist)
- [Git Version Control](#-git-version-control)

---

## 🏛 Architectural Overview

The application follows the **Layered Architectural Pattern** (Separation of Concerns):

```
Client Requests
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
│  Auth & RBAC Guards (JWT Verification & Role Check)    │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Controllers Layer (Request / Response Orchestration)  │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Service Layer (Pure Business Logic & Cryptography)    │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│  Repository Layer (Thread-Safe Atomic File Persistence)│
└────────────────────────────────────────────────────────┘
```

1. **Routing Layer (`src/routes/`)**: Mounts versioned URL endpoints and applies endpoint-specific middlewares.
2. **Middleware Layer (`src/middlewares/`)**: Executes authentication, RBAC authorization, request validation, rate limiting, and centralized error handling.
3. **Controller Layer (`src/controllers/`)**: Translates HTTP requests to service calls and structures HTTP responses using standard API schemas (`ApiResponse`).
4. **Service Layer (`src/services/`)**: Encapsulates business logic, cryptographic hashing, JWT signing/rotation, and validation rules.
5. **Repository Layer (`src/repositories/`)**: Abstracted data persistence layer supporting atomic file persistence (`data/users.json`, `data/tokens.json`). Pluggable for MongoDB, PostgreSQL, or MySQL.

---

## 🔒 End-to-End Security Architecture

| Security Domain | Implementation | Security Benefit |
| :--- | :--- | :--- |
| **HTTP Security Headers** | `helmet` | Defends against Cross-Site Scripting (XSS), Clickjacking (`X-Frame-Options`), MIME-sniffing, and enforces Strict Transport Security (HSTS). |
| **CORS Policy** | `cors` with origin whitelisting | Prevents unauthorized cross-origin requests while enabling credentialed requests (`credentials: true`) for frontend single-page apps. |
| **Brute-Force & DoS Defense** | `express-rate-limit` | Tiered rate limiting: 100 requests / 15 min for general API, and a strict 15 requests / 15 min for authentication routes. |
| **Parameter Pollution** | `hpp` | Mitigates HTTP Parameter Pollution attacks where attackers duplicate query parameters to bypass checks. |
| **Input Validation** | `zod` | Enforces runtime schema validation and strict type casting on `body`, `query`, and `params`. Rejects unexpected or malicious payloads. |
| **Password Hashing** | `bcryptjs` (Cost factor 12) | Irreversible salted password hashing resisting rainbow tables and GPU brute-force attacks. |
| **Password Strength** | Regex & Zod | Requires $\ge 8$ chars, uppercase letter, lowercase letter, numeric digit, and special symbol. |
| **JWT Access Tokens** | Short-lived (15 minutes) | Signed with 256-bit secret. Limits the exposure window if a client-side access token is intercepted. |
| **JWT Refresh Tokens** | Long-lived (7 days) in `HttpOnly` cookie | Stored in `HttpOnly`, `SameSite: Lax`, and `Secure` cookies inaccessible to JavaScript, protecting against XSS token theft. |
| **Refresh Token Rotation & Replay Detection** | Token Family ID & SHA-256 Fingerprinting | Refresh tokens can only be used once. If an already-used refresh token is presented (indicating theft), the entire token family is immediately revoked. |
| **Payload Limiting** | `express.json({ limit: '15kb' })` | Prevents Denial of Service through massive JSON memory exhaustion. |
| **Exception & Information Leakage** | Centralized `ApiError` & Error Middleware | Distinguishes operational errors from programming bugs. Error stack traces are stripped in production to prevent leakage of internal system details. |
| **Startup Configuration Guard** | Zod Schema Validation | Server validates `.env` secrets on boot (checks key length, entropy, and formatting) and halts immediately if secrets are insecure. |

---

## 🧰 Tech Stack

- **Runtime**: Node.js (`>= 20.0.0`)
- **Framework**: Express.js (`4.21.x`)
- **Authentication**: `jsonwebtoken` (JWT), `bcryptjs`
- **Validation**: `zod` (`4.x`)
- **Security**: `helmet`, `cors`, `express-rate-limit`, `hpp`, `cookie-parser`
- **Logging**: `winston` (persistent JSON file logs + color console), `morgan` (HTTP access logging)

---

## 📁 Project Directory Structure

```
dhee.work/
├── .env                  # Active environment variables (git-ignored)
├── .env.example          # Template for environment configuration
├── .gitignore            # Git exclusion rules
├── .node-version         # Node version lock for version managers
├── .nvmrc                # NVM version configuration
├── package.json          # Project manifest and npm scripts
├── README.md             # Project documentation
│
├── data/                 # Thread-safe persistent JSON database
│   ├── .gitkeep
│   ├── users.json        # User accounts table
│   └── tokens.json       # Refresh token ledger
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
│   └── test-api.js       # End-to-end automated API verification test suite
│
└── src/
    ├── app.js            # Express application middleware pipeline
    ├── server.js         # HTTP server entrypoint & graceful shutdown
    │
    ├── config/
    │   └── env.config.js # Strict environment variable validation
    │
    ├── constants/
    │   ├── httpStatusCodes.js # Standard HTTP status code constants
    │   └── roles.js           # RBAC role definitions (ADMIN, MODERATOR, USER)
    │
    ├── controllers/
    │   ├── auth.controller.js # Registration, login, logout, refresh, password reset
    │   └── user.controller.js # Profile updates, admin CRUD, statistics
    │
    ├── middlewares/
    │   ├── auth.middleware.js          # JWT bearer & cookie extractor
    │   ├── error.middleware.js         # Centralized error & 404 handler
    │   ├── rateLimiter.middleware.js   # Global and auth rate limiters
    │   ├── rbac.middleware.js          # Role-Based Access Control guards
    │   ├── requestLogger.middleware.js # Morgan to Winston stream
    │   └── validate.middleware.js      # Zod schema validation middleware
    │
    ├── repositories/
    │   ├── token.repository.js # Refresh token persistence & replay tracking
    │   └── user.repository.js  # Atomic file CRUD with pagination & search
    │
    ├── routes/
    │   ├── auth.routes.js   # /api/v1/auth/*
    │   ├── health.routes.js # /api/v1/health
    │   ├── index.js         # Versioned route router
    │   └── user.routes.js   # /api/v1/users/*
    │
    ├── services/
    │   ├── auth.service.js  # Authentication and password reset logic
    │   ├── token.service.js # Cryptographic JWT handling & token rotation
    │   └── user.service.js  # User lifecycle & administrative operations
    │
    ├── utils/
    │   ├── ApiError.js      # Standard operational error class
    │   ├── ApiResponse.js   # Uniform JSON response structure
    │   ├── asyncHandler.js  # Async route wrapper
    │   └── logger.js        # Winston logging instance
    │
    └── validators/
        ├── auth.validator.js # Zod schemas for auth endpoints
        └── user.validator.js # Zod schemas for user management endpoints
```

---

## 🐍 Node.js Virtual Environment & Isolation

To provide a project virtual environment experience equivalent to Python's `venv`, this repository includes dedicated activation scripts and version locks:

### Windows (PowerShell)

Activate the virtual environment session:
```powershell
. .\scripts\activate.ps1
```
What this does:
1. Adds the local Node runtime and `node_modules/.bin` to the active session `PATH`.
2. Validates your `.env` configuration.
3. Prefixes your command prompt with `(node-venv)`.
4. Enables deactivation via the `deactivate-node` command.

### macOS / Linux (Bash or Zsh)

Activate the virtual environment session:
```bash
source ./scripts/activate.sh
```

To deactivate at any time:
```bash
deactivate-node
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Node.js `v20.0.0` or higher (Installed: `v26.13.0`)
- Git

### 2. Automated Setup (Windows)
Run the one-click setup script:
```powershell
.\scripts\setup.ps1
```

### 3. Manual Setup

1. **Clone and enter the directory**:
   ```bash
   cd C:\Dheeraj-workSpace\dhee.work
   ```

2. **Configure Environment Variables**:
   ```bash
   # Windows PowerShell
   Copy-Item .env.example .env

   # Linux / macOS
   cp .env.example .env
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Seed Default Accounts**:
   ```bash
   npm run seed
   ```

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```

The server starts on `http://localhost:5000`.

---

## 👥 Default Seeded Credentials

After running `npm run seed`, the following test accounts are available:

| Role | Email | Password | Description |
| :--- | :--- | :--- | :--- |
| **`ADMIN`** | `admin@example.com` | `Admin@SecurePassword123!` | Full administrative capabilities: user CRUD, role management, user deletion, statistics. |
| **`MODERATOR`** | `moderator@example.com` | `Moderator@SecurePassword123!` | Elevated permissions: view all user profiles, audit user list. |
| **`USER`** | `user@example.com` | `User@SecurePassword123!` | Standard privileges: manage own profile, change password. |

---

## 🛡️ Role-Based Access Control (RBAC) Matrix

| Endpoint | Method | Public | USER | MODERATOR | ADMIN | Description |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `/api/v1/health` | `GET` | ✅ | ✅ | ✅ | ✅ | System health and memory check |
| `/api/v1/auth/register` | `POST` | ✅ | ✅ | ✅ | ✅ | Register a new user |
| `/api/v1/auth/login` | `POST` | ✅ | ✅ | ✅ | ✅ | Authenticate credentials & issue tokens |
| `/api/v1/auth/refresh-token` | `POST` | ✅ | ✅ | ✅ | ✅ | Rotate refresh token & issue new access token |
| `/api/v1/auth/logout` | `POST` | ✅ | ✅ | ✅ | ✅ | Revoke current refresh token |
| `/api/v1/auth/forgot-password`| `POST` | ✅ | ✅ | ✅ | ✅ | Generate password reset token |
| `/api/v1/auth/reset-password` | `POST` | ✅ | ✅ | ✅ | ✅ | Reset password using one-time token |
| `/api/v1/auth/me` | `GET` | ❌ | ✅ | ✅ | ✅ | View authenticated user profile |
| `/api/v1/auth/change-password`| `POST` | ❌ | ✅ | ✅ | ✅ | Change current password & invalidate sessions |
| `/api/v1/users/profile` | `PATCH`| ❌ | ✅ | ✅ | ✅ | Update own profile (name, bio) |
| `/api/v1/users` | `GET` | ❌ | ❌ | ✅ | ✅ | List all users (pagination, search, filters) |
| `/api/v1/users/:id` | `GET` | ❌ | Self only | ✅ | ✅ | View user by ID |
| `/api/v1/users` | `POST` | ❌ | ❌ | ❌ | ✅ | Admin create user with custom role |
| `/api/v1/users/:id` | `PATCH`| ❌ | ❌ | ❌ | ✅ | Admin update user (role, status, password) |
| `/api/v1/users/:id` | `DELETE`| ❌ | ❌ | ❌ | ✅ | Admin delete user (soft or hard delete) |
| `/api/v1/users/stats` | `GET` | ❌ | ❌ | ❌ | ✅ | Administrative metrics dashboard |

---

## 📡 API Documentation

### Uniform Response Formats

#### Successful Response (`ApiResponse`)
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

#### Error Response (`ApiError`)
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed for request parameters",
  "errors": [
    {
      "field": "password",
      "message": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    }
  ]
}
```

---

### 1. Health Check

#### `GET /api/v1/health`
Checks API operational status, uptime, and memory consumption.
- **Auth**: None
- **Response**: `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service is operational.",
  "data": {
    "status": "HEALTHY",
    "uptimeSeconds": 124,
    "timestamp": "2026-10-30T16:25:00.000Z",
    "environment": "development",
    "memoryUsageMB": {
      "rss": 42,
      "heapTotal": 20,
      "heapUsed": 15
    }
  }
}
```

---

### 2. Authentication Routes (`/api/v1/auth`)

#### `POST /api/v1/auth/register`
Creates a standard user account.
- **Rate Limit**: 15 requests / 15 minutes
- **Body**:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "SecurePassword@123"
}
```
- **Response**: `201 Created`
  - Sets `refreshToken` as an `HttpOnly` cookie.
  - Returns user object and `accessToken`.

#### `POST /api/v1/auth/login`
Authenticates credentials.
- **Rate Limit**: 15 requests / 15 minutes
- **Body**:
```json
{
  "email": "admin@example.com",
  "password": "Admin@SecurePassword123!"
}
```
- **Response**: `200 OK`
  - Sets `refreshToken` as an `HttpOnly` cookie.
  - Returns user profile and `accessToken`.

#### `POST /api/v1/auth/refresh-token`
Exchanges a valid refresh token for a fresh access token and rotates the refresh token.
- **Cookie**: `refreshToken=<token>` (or body `{ "refreshToken": "<token>" }`)
- **Response**: `200 OK`

#### `POST /api/v1/auth/logout`
Revokes the refresh token and clears the cookie.
- **Response**: `200 OK`

#### `GET /api/v1/auth/me`
Fetches the currently authenticated user's profile.
- **Header**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK`

#### `POST /api/v1/auth/change-password`
Changes password and terminates all active sessions across all devices.
- **Header**: `Authorization: Bearer <accessToken>`
- **Body**:
```json
{
  "currentPassword": "Admin@SecurePassword123!",
  "newPassword": "NewAdminPassword@2026!"
}
```

#### `POST /api/v1/auth/forgot-password`
Generates a one-time password reset token.
- **Body**:
```json
{
  "email": "user@example.com"
}
```

#### `POST /api/v1/auth/reset-password`
Resets password using the received token.
- **Body**:
```json
{
  "token": "76e3d2...<token>",
  "newPassword": "NewSecurePassword@2026!"
}
```

---

### 3. User Management Routes (`/api/v1/users`)

#### `GET /api/v1/users/stats`
- **Auth**: `ADMIN` only
- **Response**: `200 OK`
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "totalUsers": 3,
    "byRole": {
      "ADMIN": 1,
      "MODERATOR": 1,
      "USER": 1
    },
    "byStatus": {
      "ACTIVE": 3,
      "SUSPENDED": 0,
      "PENDING": 0
    },
    "verifiedEmails": 3
  }
}
```

#### `PATCH /api/v1/users/profile`
Self-service profile update for the logged-in user.
- **Auth**: Any logged-in user
- **Body**:
```json
{
  "name": "Jane Developer",
  "bio": "Senior Backend Architect"
}
```

#### `GET /api/v1/users`
Lists users with filtering, sorting, and pagination.
- **Auth**: `ADMIN` or `MODERATOR`
- **Query Parameters**:
  - `page` (default: 1)
  - `limit` (default: 10, max: 100)
  - `search` (searches name and email)
  - `role` (`ADMIN` | `MODERATOR` | `USER`)
  - `status` (`ACTIVE` | `SUSPENDED` | `PENDING`)
  - `sortBy` (`createdAt` | `name` | `email` | `role` | `status`)
  - `sortOrder` (`asc` | `desc`)

#### `POST /api/v1/users`
Creates a user directly with a specified role.
- **Auth**: `ADMIN` only
- **Body**:
```json
{
  "name": "Audit Moderator",
  "email": "auditor@example.com",
  "password": "AuditorPassword@123!",
  "role": "MODERATOR",
  "status": "ACTIVE"
}
```

#### `GET /api/v1/users/:id`
Retrieves a user by ID.
- **Auth**: `ADMIN`, `MODERATOR`, or the resource owner (`req.user.id === params.id`)

#### `PATCH /api/v1/users/:id`
Administrative update of user permissions, role, status, or credentials.
- **Auth**: `ADMIN` only
- **Body**:
```json
{
  "role": "MODERATOR",
  "status": "ACTIVE"
}
```

#### `DELETE /api/v1/users/:id`
Deletes a user account and invalidates all their active sessions.
- **Auth**: `ADMIN` only
- **Query Parameter**: `?hard=true` for permanent purge (defaults to soft delete).

---

## 💻 cURL Request Examples

### 1. Login as Administrator
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@SecurePassword123!"
  }'
```

### 2. View System Statistics (Bearer Token)
```bash
curl -X GET http://localhost:5000/api/v1/users/stats \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### 3. List Users with Pagination and Filtering
```bash
curl -X GET "http://localhost:5000/api/v1/users?page=1&limit=5&role=USER" \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### 4. Update Profile
```bash
curl -X PATCH http://localhost:5000/api/v1/users/profile \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"bio": "Full-stack cloud engineer"}'
```

---

## 🧪 Automated Testing

The project includes an end-to-end automated test suite verifying every security boundary and CRUD endpoint.

Run the test suite:
```bash
# In one terminal, ensure the server is running:
npm run dev

# In another terminal:
npm test
```

### What the test suite covers:
1. Service health check verification.
2. Administrator and standard user login.
3. Rejection of invalid credentials.
4. JWT token extraction and identity verification (`/me`).
5. Role-Based Access Control (standard users blocked from admin stats with `403 Forbidden`).
6. Administrator privileged access verification.
7. User self-service profile updates.
8. Password complexity validation enforcement.
9. Registration of new users.
10. Admin deletion of user accounts.
11. Forgot password token generation and password reset verification.
12. Session invalidation on credential changes.

---

## 🚢 Production Readiness Checklist

Before deploying to production environments (AWS, GCP, Heroku, Docker, Kubernetes):

- [x] **Environment Secrets**: Replace default secrets in `.env` with strong randomly generated 64-character keys:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- [x] **CORS Configuration**: Restrict `CORS_ORIGIN` to your exact frontend domain (e.g. `https://app.yourdomain.com`).
- [x] **HTTPS**: Deploy behind an SSL reverse proxy (Nginx, Caddy, Cloudflare, AWS ALB) to ensure `Secure` cookie transmission.
- [x] **Reverse Proxy Trust**: `app.set('trust proxy', 1)` is enabled in `src/app.js` to ensure client IPs are correctly resolved for rate limiters.
- [x] **Database Abstraction**: The `UserRepository` and `TokenRepository` adhere to clean interfaces and can be swapped for MongoDB (Mongoose) or PostgreSQL (Prisma/TypeORM) without changing controller or service layers.

---

## 📦 Git Version Control

The repository is initialized with a `.gitignore` that prevents credentials, log files, and local modules from leaking:

```bash
git status
```
Commit changes:
```bash
git add .
git commit -m "feat: complete production-grade user management API with auth, RBAC, and end-to-end security"
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

/**
 * @file swagger.js
 * @description OpenAPI 3.0.3 specification and Swagger UI middleware configuration
 * for interactive API exploration and testing.
 */

const swaggerUi = require('swagger-ui-express');

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Enterprise User Management & Authentication API',
    version: '1.0.0',
    description: `
Production-grade RESTful API with End-to-End Security, Role-Based Access Control (RBAC),
JWT Authentication with Refresh Token Rotation, Multi-Factor Authentication (MFA),
Account Lockout Protection, and SQLite Persistence.
    `,
    contact: {
      name: 'Engineering Team',
      email: 'security@example.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT access token as `Bearer <token>`',
      },
      CookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refreshToken',
        description: 'Signed HttpOnly refresh token cookie for session renewal',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'Operation completed successfully' },
          data: { type: 'object' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          statusCode: { type: 'integer', example: 400 },
          message: { type: 'string', example: 'Validation failed for request parameters' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'password' },
                message: { type: 'string', example: 'Password must contain at least 8 characters' },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          name: { type: 'string', example: 'Alice Smith' },
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          role: { type: 'string', enum: ['ADMIN', 'MODERATOR', 'USER'], example: 'USER' },
          status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'PENDING'], example: 'ACTIVE' },
          bio: { type: 'string', example: 'Software Engineer' },
          isEmailVerified: { type: 'boolean', example: true },
          mfaEnabled: { type: 'boolean', example: false },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'System health probes and resource monitoring' },
    { name: 'Authentication', description: 'User registration, login, logout, password resets' },
    { name: 'MFA', description: 'Multi-Factor Authentication setup, verification, and step-2 challenge' },
    { name: 'Users', description: 'User management, profiles, and administrative operations' },
  ],
  paths: {
    '/api/v1/health': {
      get: {
        tags: ['Health'],
        summary: 'System health and memory check',
        responses: {
          200: {
            description: 'Service operational status and metrics',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'John Doe' },
                  email: { type: 'string', format: 'email', example: 'john@example.com' },
                  password: { type: 'string', format: 'password', example: 'StrongPassword@123' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered successfully and tokens issued' },
          400: { description: 'Validation error (weak password or malformed data)' },
          409: { description: 'Account with email already exists' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate with email and password',
        description: 'Issues JWT access token and sets HttpOnly refresh cookie. If MFA is active, returns an MFA challenge token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'admin@example.com' },
                  password: { type: 'string', example: 'Admin@SecurePassword123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful or MFA challenge returned' },
          401: { description: 'Invalid credentials or account locked' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/auth/mfa/login-step2': {
      post: {
        tags: ['MFA'],
        summary: 'Complete MFA Login Challenge (Step 2)',
        description: 'Submit 6-digit TOTP code and challenge token to receive access & refresh tokens.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['mfaToken', 'code'],
                properties: {
                  mfaToken: { type: 'string', example: 'eyJhbGci...' },
                  code: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MFA verified. Logged in successfully.' },
          401: { description: 'Invalid OTP code or expired MFA session' },
        },
      },
    },
    '/api/v1/auth/mfa/setup': {
      post: {
        tags: ['MFA'],
        summary: 'Initiate MFA Setup',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'MFA secret and otpauth URL generated' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/mfa/verify': {
      post: {
        tags: ['MFA'],
        summary: 'Verify and Activate MFA',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: {
                  code: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MFA enabled successfully' },
          400: { description: 'Invalid verification code' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/mfa/disable': {
      post: {
        tags: ['MFA'],
        summary: 'Disable MFA on Account',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  password: { type: 'string', example: 'CurrentPassword@123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'MFA disabled' },
          401: { description: 'Incorrect password or unauthorized' },
        },
      },
    },
    '/api/v1/auth/refresh-token': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate Refresh Token and issue new Access Token',
        security: [{ CookieAuth: [] }],
        responses: {
          200: { description: 'Token refreshed successfully' },
          401: { description: 'Invalid, expired, or compromised token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout and revoke refresh token',
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user profile',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Current user profile payload' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/change-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Change password and revoke all sessions',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed successfully' },
          400: { description: 'Incorrect current password or weak new password' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Request password reset token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset token generated' },
        },
      },
    },
    '/api/v1/auth/reset-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Reset password using token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'newPassword'],
                properties: {
                  token: { type: 'string' },
                  newPassword: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset successfully' },
          400: { description: 'Invalid or expired token' },
        },
      },
    },
    '/api/v1/users/stats': {
      get: {
        tags: ['Users'],
        summary: 'Administrative metrics dashboard',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'User statistics and aggregates' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
    },
    '/api/v1/users/profile': {
      patch: {
        tags: ['Users'],
        summary: 'Update own profile (name, bio)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  bio: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/v1/users': {
      get: {
        tags: ['Users'],
        summary: 'List users with pagination and search',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['ADMIN', 'MODERATOR', 'USER'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'PENDING'] } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: { description: 'Paginated user list' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (ADMIN or MODERATOR)' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Admin create user with custom role',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['ADMIN', 'MODERATOR', 'USER'], default: 'USER' },
                  status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'PENDING'], default: 'ACTIVE' },
                  bio: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User created' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (ADMIN only)' },
        },
      },
    },
    '/api/v1/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Get user details by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'User details' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (ADMIN, MODERATOR, or resource owner)' },
          404: { description: 'User not found' },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Admin update user details/role/status',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  bio: { type: 'string' },
                  role: { type: 'string', enum: ['ADMIN', 'MODERATOR', 'USER'] },
                  status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'PENDING'] },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'User updated' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (ADMIN only)' },
          404: { description: 'User not found' },
        },
      },
      delete: {
        tags: ['Users'],
        summary: 'Admin delete user',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'hard', in: 'query', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          200: { description: 'User deleted' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (ADMIN only)' },
          404: { description: 'User not found' },
        },
      },
    },
  },
};

module.exports = {
  swaggerUi,
  swaggerSpec,
};

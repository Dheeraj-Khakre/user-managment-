/**
 * @file user.validator.js
 * @description Zod validation schemas for user management endpoints.
 */

const { z } = require('zod');
const { ROLES } = require('../constants/roles');
const { passwordConstraint } = require('./auth.validator');

/**
 * Validates route parameters containing UUID/ID
 */
const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'User ID is required'),
  }),
});

/**
 * User self-service profile update schema
 */
const updateProfileSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      bio: z.string().trim().max(300).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field (name or bio) must be provided for update',
    }),
});

/**
 * Admin creation schema
 */
const adminCreateUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().toLowerCase().max(150),
    password: passwordConstraint,
    role: z.enum([ROLES.ADMIN, ROLES.MODERATOR, ROLES.USER]).default(ROLES.USER),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).default('ACTIVE'),
    bio: z.string().trim().max(300).optional(),
    isEmailVerified: z.boolean().optional(),
  }),
});

/**
 * Admin update schema
 */
const adminUpdateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Target user ID is required'),
  }),
  body: z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      bio: z.string().trim().max(300).optional(),
      role: z.enum([ROLES.ADMIN, ROLES.MODERATOR, ROLES.USER]).optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
      password: passwordConstraint.optional(),
      isEmailVerified: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one property must be provided to update',
    }),
});

/**
 * Query schema for user listing and pagination
 */
const queryUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().optional(),
    role: z.enum([ROLES.ADMIN, ROLES.MODERATOR, ROLES.USER]).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
    sortBy: z.enum(['createdAt', 'name', 'email', 'role', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

module.exports = {
  userIdParamSchema,
  updateProfileSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  queryUsersSchema,
};

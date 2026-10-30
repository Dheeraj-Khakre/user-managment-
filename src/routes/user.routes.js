/**
 * @file user.routes.js
 * @description User management routing layer guarded with JWT authentication
 * and Role-Based Access Control (RBAC).
 */

const express = require('express');
const userController = require('../controllers/user.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { requireRoles, requireOwnerOrRoles } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../constants/roles');
const {
  userIdParamSchema,
  updateProfileSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  queryUsersSchema,
} = require('../validators/user.validator');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// 1. Administrative statistics (ADMIN only) - Defined before :id to prevent matching 'stats' as an ID
router.get('/stats', requireRoles(ROLES.ADMIN), userController.getStats);

// 2. Self-service profile update for the logged-in user
router.patch('/profile', validate(updateProfileSchema), userController.updateProfile);

// 3. Administrative user list (ADMIN and MODERATOR)
router.get('/', requireRoles(ROLES.ADMIN, ROLES.MODERATOR), validate(queryUsersSchema), userController.getAllUsers);

// 4. Admin creation of new user (ADMIN only)
router.post('/', requireRoles(ROLES.ADMIN), validate(adminCreateUserSchema), userController.createUser);

// 5. Retrieve specific user by ID (ADMIN, MODERATOR, or resource owner)
router.get(
  '/:id',
  validate(userIdParamSchema),
  requireOwnerOrRoles('id', ROLES.ADMIN, ROLES.MODERATOR),
  userController.getUserById
);

// 6. Administrative update of user details and roles (ADMIN only)
router.patch(
  '/:id',
  requireRoles(ROLES.ADMIN),
  validate(adminUpdateUserSchema),
  userController.updateUser
);

// 7. Administrative deletion of user (ADMIN only)
router.delete(
  '/:id',
  requireRoles(ROLES.ADMIN),
  validate(userIdParamSchema),
  userController.deleteUser
);

module.exports = router;

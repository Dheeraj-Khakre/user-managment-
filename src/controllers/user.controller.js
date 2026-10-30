/**
 * @file user.controller.js
 * @description Controller handling user management, self-service profile updates,
 * administrative CRUD operations, and system analytics.
 */

const userService = require('../services/user.service');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

class UserController {
  /**
   * Retrieves a paginated list of users.
   * GET /api/v1/users
   * Allowed roles: ADMIN, MODERATOR
   */
  getAllUsers = asyncHandler(async (req, res) => {
    const { page, limit, search, role, status, sortBy, sortOrder } = req.query;

    const result = await userService.getAllUsers({
      page,
      limit,
      search,
      role,
      status,
      sortBy,
      sortOrder,
    });

    return ApiResponse.ok(
      res,
      result.users,
      'Users retrieved successfully.',
      {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      }
    );
  });

  /**
   * Retrieves user details by ID.
   * GET /api/v1/users/:id
   * Allowed roles: ADMIN or resource owner
   */
  getUserById = asyncHandler(async (req, res) => {
    const user = await userService.getUserById(req.params.id);
    return ApiResponse.ok(res, user, 'User details retrieved.');
  });

  /**
   * Allows the logged-in user to update their own profile.
   * PATCH /api/v1/users/profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const { name, bio } = req.body;
    const updatedUser = await userService.updateUserProfile(req.user.id, { name, bio });
    return ApiResponse.ok(res, updatedUser, 'Your profile has been updated.');
  });

  /**
   * Administrative creation of a new user.
   * POST /api/v1/users
   * Allowed roles: ADMIN
   */
  createUser = asyncHandler(async (req, res) => {
    const newUser = await userService.createUserByAdmin(req.body);
    return ApiResponse.created(res, newUser, 'User created successfully.');
  });

  /**
   * Administrative update of user account (roles, status, details).
   * PATCH /api/v1/users/:id
   * Allowed roles: ADMIN
   */
  updateUser = asyncHandler(async (req, res) => {
    const updatedUser = await userService.updateUserByAdmin(
      req.params.id,
      req.body,
      req.user.id
    );
    return ApiResponse.ok(res, updatedUser, 'User updated successfully.');
  });

  /**
   * Administrative deletion of a user.
   * DELETE /api/v1/users/:id
   * Allowed roles: ADMIN
   */
  deleteUser = asyncHandler(async (req, res) => {
    const hardDelete = req.query.hard === 'true';
    await userService.deleteUser(req.params.id, req.user.id, hardDelete);
    return ApiResponse.ok(
      res,
      null,
      `User ${hardDelete ? 'permanently' : 'soft'} deleted successfully.`
    );
  });

  /**
   * Retrieves aggregated system user metrics.
   * GET /api/v1/users/stats
   * Allowed roles: ADMIN
   */
  getStats = asyncHandler(async (req, res) => {
    const stats = await userService.getSystemStatistics();
    return ApiResponse.ok(res, stats, 'User management statistics retrieved.');
  });
}

module.exports = new UserController();

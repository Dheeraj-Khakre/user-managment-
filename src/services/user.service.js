/**
 * @file user.service.js
 * @description User management business logic service.
 * Handles user profiles, administrative CRUD operations, role assignments,
 * and system statistics.
 */

const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/token.repository');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/roles');

class UserService {
  /**
   * Retrieves user profile by user ID.
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUserProfile(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User profile not found.');
    }
    return user;
  }

  /**
   * Updates authenticated user's own profile.
   * Users can only update non-privilege fields (name, bio).
   * @param {string} userId
   * @param {Object} updateData
   * @returns {Promise<Object>}
   */
  async updateUserProfile(userId, { name, bio }) {
    const existing = await userRepository.findById(userId);
    if (!existing) {
      throw ApiError.notFound('User not found.');
    }

    const payload = {};
    if (name !== undefined) payload.name = name.trim();
    if (bio !== undefined) payload.bio = bio.trim();

    const updated = await userRepository.update(userId, payload);
    logger.info(`User [${userId}] updated their profile`);
    return updated;
  }

  /**
   * Retrieves a paginated list of users with filtering and search.
   * Accessible by ADMIN and MODERATOR roles.
   * @param {Object} queryOptions
   * @returns {Promise<Object>}
   */
  async getAllUsers(queryOptions) {
    return userRepository.findAll(queryOptions);
  }

  /**
   * Retrieves user details by ID (Administrative view).
   * @param {string} userId
   * @returns {Promise<Object>}
   */
  async getUserById(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found.');
    }
    return user;
  }

  /**
   * Administrative creation of a new user with designated role.
   * Accessible by ADMIN only.
   * @param {Object} userData
   * @returns {Promise<Object>}
   */
  async createUserByAdmin(userData) {
    const existing = await userRepository.findByEmail(userData.email);
    if (existing) {
      throw ApiError.conflict('User with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);

    const newUser = await userRepository.create({
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      role: userData.role || ROLES.USER,
      status: userData.status || 'ACTIVE',
      bio: userData.bio || '',
      isEmailVerified: userData.isEmailVerified !== undefined ? userData.isEmailVerified : true,
    });

    logger.info(`Admin created user: [${newUser.id}] with role ${newUser.role}`);
    return newUser;
  }

  /**
   * Administrative update of any user (including changing role and account status).
   * Accessible by ADMIN only.
   * @param {string} targetUserId
   * @param {Object} updateData
   * @param {string} actorAdminId
   * @returns {Promise<Object>}
   */
  async updateUserByAdmin(targetUserId, updateData, actorAdminId) {
    const user = await userRepository.findById(targetUserId);
    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    // Safety guard: prevent admin from demoting or suspending their own account accidentally
    if (targetUserId === actorAdminId) {
      if (updateData.role && updateData.role !== ROLES.ADMIN) {
        throw ApiError.badRequest('Administrators cannot demote their own role.');
      }
      if (updateData.status && updateData.status !== 'ACTIVE') {
        throw ApiError.badRequest('Administrators cannot suspend their own account.');
      }
    }

    const payload = {};
    if (updateData.name !== undefined) payload.name = updateData.name.trim();
    if (updateData.bio !== undefined) payload.bio = updateData.bio.trim();
    if (updateData.role !== undefined) payload.role = updateData.role;
    if (updateData.status !== undefined) payload.status = updateData.status;
    if (updateData.isEmailVerified !== undefined) payload.isEmailVerified = updateData.isEmailVerified;

    // If changing password by admin
    if (updateData.password) {
      payload.password = await bcrypt.hash(updateData.password, 12);
      // Revoke all tokens for that user
      await tokenRepository.revokeAllUserTokens(targetUserId);
    }

    // If suspending user, revoke all active sessions immediately
    if (updateData.status === 'SUSPENDED') {
      await tokenRepository.revokeAllUserTokens(targetUserId);
    }

    const updated = await userRepository.update(targetUserId, payload);
    logger.info(`Admin [${actorAdminId}] updated user [${targetUserId}]`);
    return updated;
  }

  /**
   * Deletes a user account.
   * Accessible by ADMIN only.
   * @param {string} targetUserId
   * @param {string} actorAdminId
   * @param {boolean} [hardDelete=false]
   * @returns {Promise<boolean>}
   */
  async deleteUser(targetUserId, actorAdminId, hardDelete = false) {
    const user = await userRepository.findById(targetUserId);
    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    // Safety guard: prevent admin from deleting their own account
    if (targetUserId === actorAdminId) {
      throw ApiError.badRequest('Administrators cannot delete their own account.');
    }

    // Revoke all active sessions
    await tokenRepository.revokeAllUserTokens(targetUserId);

    await userRepository.delete(targetUserId, hardDelete);
    logger.info(`Admin [${actorAdminId}] deleted user [${targetUserId}] (hardDelete=${hardDelete})`);
    return true;
  }

  /**
   * Retrieves administrative dashboard metrics and counts.
   * Accessible by ADMIN only.
   * @returns {Promise<Object>}
   */
  async getSystemStatistics() {
    return userRepository.getStatistics();
  }
}

module.exports = new UserService();

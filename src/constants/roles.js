/**
 * @file roles.js
 * @description Defines the Role-Based Access Control (RBAC) role enumerations and hierarchy.
 */

/**
 * Supported user roles in the system.
 * @readonly
 * @enum {string}
 */
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  USER: 'USER',
});

/**
 * Role hierarchy array where higher index represents higher privilege.
 * Useful for determining role seniority or inheritance.
 * @type {string[]}
 */
const ROLE_HIERARCHY = [
  ROLES.USER,
  ROLES.MODERATOR,
  ROLES.ADMIN,
];

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
};

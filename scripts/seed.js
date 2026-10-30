/**
 * @file seed.js
 * @description Database seeder script creating baseline Admin, Moderator, and User test accounts.
 * Passwords comply with strict complexity criteria and are hashed with bcrypt.
 */

const bcrypt = require('bcryptjs');
const userRepository = require('../src/repositories/user.repository');
const logger = require('../src/utils/logger');
const { ROLES } = require('../src/constants/roles');

async function seedDatabase() {
  logger.info('Starting database seeding process...');

  const defaultUsers = [
    {
      name: 'System Administrator',
      email: 'admin@example.com',
      rawPassword: 'Admin@SecurePassword123!',
      role: ROLES.ADMIN,
      bio: 'Master system administrator with full administrative access.',
      status: 'ACTIVE',
      isEmailVerified: true,
    },
    {
      name: 'Content Moderator',
      email: 'moderator@example.com',
      rawPassword: 'Moderator@SecurePassword123!',
      role: ROLES.MODERATOR,
      bio: 'Moderator responsible for user and content review.',
      status: 'ACTIVE',
      isEmailVerified: true,
    },
    {
      name: 'Standard User',
      email: 'user@example.com',
      rawPassword: 'User@SecurePassword123!',
      role: ROLES.USER,
      bio: 'Standard registered user profile.',
      status: 'ACTIVE',
      isEmailVerified: true,
    },
  ];

  for (const account of defaultUsers) {
    const existing = await userRepository.findByEmail(account.email);
    if (!existing) {
      const hashedPassword = await bcrypt.hash(account.rawPassword, 12);
      const created = await userRepository.create({
        name: account.name,
        email: account.email,
        password: hashedPassword,
        role: account.role,
        status: account.status,
        bio: account.bio,
        isEmailVerified: account.isEmailVerified,
      });

      logger.info(`✅ Seeded account: ${account.email} (${account.role})`);
    } else {
      logger.info(`ℹ️ Account already exists: ${account.email}`);
    }
  }

  logger.info('🎉 Database seeding completed successfully!');
  logger.info('\nDefault credentials:');
  defaultUsers.forEach((u) => {
    logger.info(`- [${u.role}] Email: ${u.email} | Password: ${u.rawPassword}`);
  });
}

seedDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Database seeding failed:', err);
    process.exit(1);
  });

/**
 * @file test-api.js
 * @description End-to-end automated test suite verifying all authentication,
 * authorization (RBAC), and user management API endpoints.
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

// Helper for making HTTP JSON requests
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }

        // Extract cookies if any
        const setCookie = res.headers['set-cookie'];

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          cookies: setCookie,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' Starting End-to-End API Security & Functionality Tests');
  console.log('======================================================\n');

  // 1. Health check
  console.log('--- Test 1: Health Check ---');
  const healthRes = await request('GET', '/api/v1/health');
  assert(healthRes.statusCode === 200, 'Health endpoint returns 200 OK');
  assert(healthRes.data.data.status === 'HEALTHY', 'Service health is HEALTHY');

  // 2. Authentication: Login as Admin
  console.log('\n--- Test 2: Admin Login ---');
  const adminLogin = await request('POST', '/api/v1/auth/login', {
    email: 'admin@example.com',
    password: 'Admin@SecurePassword123!',
  });
  assert(adminLogin.statusCode === 200, 'Admin login returns 200 OK');
  assert(adminLogin.data.data.accessToken, 'Access token issued');
  const adminToken = adminLogin.data.data.accessToken;

  // 3. Authentication: Login as Normal User
  console.log('\n--- Test 3: Standard User Login ---');
  const userLogin = await request('POST', '/api/v1/auth/login', {
    email: 'user@example.com',
    password: 'User@SecurePassword123!',
  });
  assert(userLogin.statusCode === 200, 'User login returns 200 OK');
  const userToken = userLogin.data.data.accessToken;
  const userRefreshTokenCookie = userLogin.cookies ? userLogin.cookies[0] : null;

  // 4. Verification of Invalid Credentials
  console.log('\n--- Test 4: Rejection of Invalid Password ---');
  const badLogin = await request('POST', '/api/v1/auth/login', {
    email: 'user@example.com',
    password: 'WrongPassword123!',
  });
  assert(badLogin.statusCode === 401, 'Invalid password returns 401 Unauthorized');

  // 5. Protected Route: /api/v1/auth/me
  console.log('\n--- Test 5: Verify Auth Middleware (GET /api/v1/auth/me) ---');
  const meRes = await request('GET', '/api/v1/auth/me', null, {
    Authorization: `Bearer ${userToken}`,
  });
  assert(meRes.statusCode === 200, 'User profile fetched via valid Bearer token');
  assert(meRes.data.data.email === 'user@example.com', 'Profile matches logged-in user');

  // 6. RBAC Authorization: Standard user denied access to Admin stats
  console.log('\n--- Test 6: RBAC Guard (User blocked from Admin stats) ---');
  const forbiddenStats = await request('GET', '/api/v1/users/stats', null, {
    Authorization: `Bearer ${userToken}`,
  });
  assert(forbiddenStats.statusCode === 403, 'User receives 403 Forbidden on Admin endpoint');

  // 7. RBAC Authorization: Admin allowed access to Admin stats
  console.log('\n--- Test 7: RBAC Access (Admin allowed to view stats) ---');
  const adminStats = await request('GET', '/api/v1/users/stats', null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert(adminStats.statusCode === 200, 'Admin receives 200 OK on /api/v1/users/stats');
  assert(adminStats.data.data.totalUsers >= 3, 'User statistics contains total counts');

  // 8. User Management: Self-service profile update
  console.log('\n--- Test 8: User Profile Update ---');
  const updateProfile = await request(
    'PATCH',
    '/api/v1/users/profile',
    { bio: 'Updated bio by self-service test' },
    { Authorization: `Bearer ${userToken}` }
  );
  assert(updateProfile.statusCode === 200, 'User profile updated successfully');
  assert(updateProfile.data.data.bio === 'Updated bio by self-service test', 'Bio matches updated value');

  // 9. Input Validation: Weak password rejected during registration
  console.log('\n--- Test 9: Input Validation & Password Complexity Guard ---');
  const weakRegister = await request('POST', '/api/v1/auth/register', {
    name: 'Weak User',
    email: 'weak@example.com',
    password: 'weak',
  });
  assert(weakRegister.statusCode === 400, 'Weak password rejected with 400 Bad Request');
  assert(weakRegister.data.errors.length > 0, 'Validation errors returned in structured format');

  // 10. User Registration (Strong credentials)
  console.log('\n--- Test 10: New User Registration ---');
  const testEmail = `tester_${Date.now()}@example.com`;
  const registerRes = await request('POST', '/api/v1/auth/register', {
    name: 'Test Engineer',
    email: testEmail,
    password: 'Password@2026Secure!',
  });
  assert(registerRes.statusCode === 201, 'User successfully registered with 201 Created');
  assert(registerRes.data.data.accessToken, 'Access token generated on registration');
  const createdUserId = registerRes.data.data.user.id;

  // 11. Admin User Deletion
  console.log('\n--- Test 11: Admin User Deletion ---');
  const deleteRes = await request('DELETE', `/api/v1/users/${createdUserId}`, null, {
    Authorization: `Bearer ${adminToken}`,
  });
  assert(deleteRes.statusCode === 200, 'User deleted by admin with 200 OK');

  // 12. Forgot Password and Reset Flow
  console.log('\n--- Test 12: Forgot Password and Reset Flow ---');
  const forgotRes = await request('POST', '/api/v1/auth/forgot-password', {
    email: 'user@example.com',
  });
  assert(forgotRes.statusCode === 200, 'Forgot password returns 200 OK');
  const resetToken = forgotRes.data.data.resetToken;
  assert(resetToken, 'Reset token generated');

  const resetRes = await request('POST', '/api/v1/auth/reset-password', {
    token: resetToken,
    newPassword: 'User@NewPassword2026!',
  });
  assert(resetRes.statusCode === 200, 'Password reset succeeded with 200 OK');

  // Login with new password
  const newLoginRes = await request('POST', '/api/v1/auth/login', {
    email: 'user@example.com',
    password: 'User@NewPassword2026!',
  });
  assert(newLoginRes.statusCode === 200, 'Successfully logged in with new reset password');

  // Reset back to original password for consistency
  const resetBack = await request('POST', '/api/v1/auth/change-password', {
    currentPassword: 'User@NewPassword2026!',
    newPassword: 'User@SecurePassword123!',
  }, {
    Authorization: `Bearer ${newLoginRes.data.data.accessToken}`,
  });
  assert(resetBack.statusCode === 200, 'Reverted user password back to baseline');

  console.log('\n======================================================');
  console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY!          ');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});

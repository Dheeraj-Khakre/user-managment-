/**
 * End-to-end checks for authentication, authorization, user management,
 * password resets, and refresh-token rotation.
 */

const http = require('http');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
let cleanupUserId = null;
let cleanupAdminToken = null;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    if (body !== null) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`PASSED: ${message}`);
}

function authorization(token) {
  return { Authorization: `Bearer ${token}` };
}

function cookieFrom(response) {
  return response.headers['set-cookie']?.[0]?.split(';', 1)[0];
}

async function runTests() {
  console.log(`Running API end-to-end checks against ${BASE_URL}`);

  const health = await request('GET', '/api/v1/health');
  assert(health.statusCode === 200 && health.data.data.status === 'HEALTHY', 'API health check');

  const adminLogin = await request('POST', '/api/v1/auth/login', {
    email: 'admin@example.com',
    password: 'Admin@SecurePassword123!',
  });
  assert(adminLogin.statusCode === 200 && adminLogin.data.data.accessToken, 'Admin login');
  const adminToken = adminLogin.data.data.accessToken;
  cleanupAdminToken = adminToken;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const testEmail = `e2e-${suffix}@example.com`;
  const testPassword = 'E2eUser@2026Secure!';
  const registration = await request('POST', '/api/v1/auth/register', {
    name: 'End-to-End User',
    email: testEmail,
    password: testPassword,
  });
  const registeredUser = registration.data?.data;
  cleanupUserId = registeredUser?.user?.id ?? null;
  assert(registration.statusCode === 201 && registeredUser?.accessToken, 'User registration');
  const userToken = registeredUser.accessToken;
  const userId = registeredUser.user.id;

  const invalidLogin = await request('POST', '/api/v1/auth/login', {
    email: testEmail,
    password: 'WrongPassword@2026!',
  });
  assert(invalidLogin.statusCode === 401, 'Invalid password is rejected');

  const profile = await request('GET', '/api/v1/auth/me', null, authorization(userToken));
  assert(profile.statusCode === 200 && profile.data.data.email === testEmail, 'Authenticated profile');

  const forbiddenStats = await request('GET', '/api/v1/users/stats', null, authorization(userToken));
  assert(forbiddenStats.statusCode === 403, 'Standard user is denied admin statistics');

  const adminStats = await request('GET', '/api/v1/users/stats', null, authorization(adminToken));
  assert(adminStats.statusCode === 200 && adminStats.data.data.totalUsers >= 4, 'Admin statistics access');

  const updatedProfile = await request('PATCH', '/api/v1/users/profile', { bio: 'E2E profile update' }, authorization(userToken));
  assert(updatedProfile.statusCode === 200 && updatedProfile.data.data.bio === 'E2E profile update', 'Self-service profile update');

  const weakRegistration = await request('POST', '/api/v1/auth/register', {
    name: 'Weak Password',
    email: `weak-${suffix}@example.com`,
    password: 'weak',
  });
  assert(weakRegistration.statusCode === 400, 'Weak password validation');

  const adminCreated = await request('POST', '/api/v1/users', {
    name: 'Admin-Created E2E User',
    email: `admin-created-${suffix}@example.com`,
    password: 'AdminCreated@2026!',
    role: 'USER',
    status: 'ACTIVE',
    bio: '',
  }, authorization(adminToken));
  assert(adminCreated.statusCode === 201, 'Admin creates a directory account');

  const adminUpdated = await request('PATCH', `/api/v1/users/${adminCreated.data.data.id}`, {
    role: 'MODERATOR',
    status: 'PENDING',
  }, authorization(adminToken));
  assert(adminUpdated.statusCode === 200 && adminUpdated.data.data.role === 'MODERATOR', 'Admin changes account role and status');

  const adminDeleted = await request('DELETE', `/api/v1/users/${adminCreated.data.data.id}`, null, authorization(adminToken));
  assert(adminDeleted.statusCode === 200, 'Admin deactivates the directory account');

  const initialCookie = cookieFrom(registration);
  assert(Boolean(initialCookie), 'Registration issues refresh-token cookie');
  const refreshed = await request('POST', '/api/v1/auth/refresh-token', {}, { Cookie: initialCookie });
  assert(refreshed.statusCode === 200 && refreshed.data.data.accessToken, 'Refresh token rotation');

  const rotatedCookie = cookieFrom(refreshed);
  assert(Boolean(rotatedCookie), 'Refresh rotates the cookie');
  const logout = await request('POST', '/api/v1/auth/logout', {}, { Cookie: rotatedCookie });
  assert(logout.statusCode === 200, 'Logout');

  const expiredRefresh = await request('POST', '/api/v1/auth/refresh-token', {}, { Cookie: initialCookie });
  assert(expiredRefresh.statusCode === 401, 'A rotated refresh token cannot be reused');

  const forgotPassword = await request('POST', '/api/v1/auth/forgot-password', { email: testEmail });
  assert(forgotPassword.statusCode === 200, 'Forgot-password request');
  assert(forgotPassword.data.data.resetToken === undefined, 'Forgot-password response does not expose a reset token');

  const missingStepUp = await request('POST', '/api/v1/auth/change-password', {
    currentPassword: testPassword,
    newPassword: 'E2eChanged@2026Secure!',
  }, authorization(userToken));
  assert(missingStepUp.statusCode === 403, 'Password change is blocked without step-up verification');

  const stepUp = await request('POST', '/api/v1/auth/security/verify', {
    method: 'password',
    purpose: 'password_change',
    password: testPassword,
  }, authorization(userToken));
  assert(stepUp.statusCode === 200 && stepUp.data.data.stepUpToken, 'Password fallback issues a scoped step-up token');

  const passwordChange = await request('POST', '/api/v1/auth/change-password', {
    currentPassword: testPassword,
    newPassword: 'E2eChanged@2026Secure!',
  }, {
    ...authorization(userToken),
    'X-Step-Up-Token': stepUp.data.data.stepUpToken,
  });
  assert(passwordChange.statusCode === 200, 'Password change succeeds after step-up verification');

  const changedPasswordLogin = await request('POST', '/api/v1/auth/login', {
    email: testEmail,
    password: 'E2eChanged@2026Secure!',
  });
  assert(changedPasswordLogin.statusCode === 200, 'Login succeeds with changed password');

  const cleanup = await request('DELETE', `/api/v1/users/${userId}`, null, authorization(adminToken));
  assert(cleanup.statusCode === 200, 'Remove temporary E2E user');
  cleanupUserId = null;

  console.log('All API end-to-end checks passed.');
}

runTests().catch(async (error) => {
  if (cleanupUserId && cleanupAdminToken) {
    try {
      const cleanup = await request('DELETE', `/api/v1/users/${cleanupUserId}`, null, authorization(cleanupAdminToken));
      if (cleanup.statusCode !== 200) console.error('Temporary E2E user cleanup failed.');
    } catch {
      console.error('Temporary E2E user cleanup failed.');
    }
  }
  console.error('API end-to-end checks failed:', error.message);
  process.exitCode = 1;
});

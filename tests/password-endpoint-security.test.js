/**
 * Integration tests for password management endpoint security
 */

const request = require('supertest');
const app = require('../src/index');
const authService = require('../src/services/auth-service');
const fs = require('fs');
const path = require('path');

// Test credentials file
const TEST_CREDENTIALS_PATH = path.join(__dirname, '../data/test-password-endpoint.json');

const testEnv = {
  ROSTER_CREDENTIALS_PATH: TEST_CREDENTIALS_PATH
};

function cleanupTestCredentials() {
  if (fs.existsSync(TEST_CREDENTIALS_PATH)) {
    fs.unlinkSync(TEST_CREDENTIALS_PATH);
  }
}

describe('Password Management Endpoint Security', () => {
  beforeEach(() => {
    cleanupTestCredentials();
    // Override the environment for auth service
    process.env.ROSTER_CREDENTIALS_PATH = TEST_CREDENTIALS_PATH;
  });

  afterEach(() => {
    cleanupTestCredentials();
    delete process.env.ROSTER_CREDENTIALS_PATH;
  });

  describe('Initial password creation (no existing password)', () => {
    test('should allow setting password without authentication for new user', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .send({ staffNo: '123456', password: 'newPassword123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.staffNo).toBe('123456');
      expect(response.body.message).toBe('Password created successfully');

      // Verify password was actually set
      const hasPassword = authService.hasCredentials('123456', testEnv);
      expect(hasPassword).toBe(true);
    });

    test('should enforce minimum password length for new user', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .send({ staffNo: '111111', password: '12345' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('at least 6 characters');
    });
  });

  describe('Password updates (existing password)', () => {
    beforeEach(async () => {
      // Set up existing password
      await authService.setPasswordForStaffNo('123456', 'existingPassword', testEnv);
    });

    test('should require authentication to update existing password', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .send({ staffNo: '123456', password: 'newPassword123' })
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
      expect(response.body.message).toContain('current password');
    });

    test('should allow password update with valid authentication', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .auth('123456', 'existingPassword')
        .send({ staffNo: '123456', password: 'newPassword123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password updated successfully');

      // Verify new password works
      const isValid = await authService.verifyCredentials('123456', 'newPassword123', testEnv);
      expect(isValid).toBe(true);

      // Verify old password doesn't work
      const isOldValid = await authService.verifyCredentials('123456', 'existingPassword', testEnv);
      expect(isOldValid).toBe(false);
    });

    test('should reject password update with wrong current password', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .auth('123456', 'wrongPassword')
        .send({ staffNo: '123456', password: 'newPassword123' })
        .expect(401);

      expect(response.body.error).toBe('Authentication failed');
      expect(response.body.message).toContain('Invalid current password');
    });

    test('should prevent user from updating another user\'s password', async () => {
      // Create another user
      await authService.setPasswordForStaffNo('999999', 'anotherPassword', testEnv);

      // Try to update user 999999's password while authenticated as 123456
      const response = await request(app)
        .post('/api/roster/password')
        .auth('123456', 'existingPassword')
        .send({ staffNo: '999999', password: 'hackedPassword' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied');
      expect(response.body.message).toContain('only update your own password');

      // Verify password wasn't changed
      const isValid = await authService.verifyCredentials('999999', 'anotherPassword', testEnv);
      expect(isValid).toBe(true);
      const isHacked = await authService.verifyCredentials('999999', 'hackedPassword', testEnv);
      expect(isHacked).toBe(false);
    });
  });

  describe('Input validation', () => {
    test('should require staffNo', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .send({ password: 'password123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Staff number is required');
    });

    test('should require password', async () => {
      const response = await request(app)
        .post('/api/roster/password')
        .send({ staffNo: '123456' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Password is required');
    });
  });
});

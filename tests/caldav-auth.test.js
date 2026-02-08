/**
 * Integration tests for CalDAV authentication
 */

const request = require('supertest');
const express = require('express');
const { authenticateCalDAV } = require('../src/middleware/caldav-auth');
const authService = require('../src/services/auth-service');
const fs = require('fs');
const path = require('path');

// Test credentials file
const TEST_CREDENTIALS_PATH = path.join(__dirname, '../data/test-caldav-credentials.json');

const testEnv = {
  ROSTER_CREDENTIALS_PATH: TEST_CREDENTIALS_PATH
};

function cleanupTestCredentials() {
  if (fs.existsSync(TEST_CREDENTIALS_PATH)) {
    fs.unlinkSync(TEST_CREDENTIALS_PATH);
  }
}

// Create a simple test app
function createTestApp() {
  const app = express();
  
  // Protected route
  app.get('/protected', authenticateCalDAV, (req, res) => {
    res.json({ 
      success: true, 
      message: 'Access granted',
      staffNo: req.authenticatedStaffNo 
    });
  });
  
  return app;
}

describe('CalDAV Authentication Middleware', () => {
  let app;
  
  beforeEach(async () => {
    cleanupTestCredentials();
    app = createTestApp();
    
    // Set up test credentials
    await authService.setPasswordForStaffNo('123456', 'testPassword123', testEnv);
    await authService.setPasswordForStaffNo('999999', 'anotherPassword', testEnv);
  });

  afterEach(() => {
    cleanupTestCredentials();
  });

  test('should allow access with valid credentials', async () => {
    const response = await request(app)
      .get('/protected')
      .auth('123456', 'testPassword123')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.staffNo).toBe('123456');
  });

  test('should deny access without credentials', async () => {
    const response = await request(app)
      .get('/protected')
      .expect(401);

    expect(response.body.error).toBe('Authentication required');
    expect(response.headers['www-authenticate']).toBe('Basic realm="Roster Calendar"');
  });

  test('should deny access with invalid password', async () => {
    const response = await request(app)
      .get('/protected')
      .auth('123456', 'wrongPassword')
      .expect(401);

    expect(response.body.error).toBe('Authentication failed');
    expect(response.headers['www-authenticate']).toBe('Basic realm="Roster Calendar"');
  });

  test('should deny access with non-existent staff number', async () => {
    const response = await request(app)
      .get('/protected')
      .auth('000000', 'anyPassword')
      .expect(401);

    expect(response.body.error).toBe('Authentication failed');
  });

  test('should allow access for different valid users', async () => {
    const response1 = await request(app)
      .get('/protected')
      .auth('123456', 'testPassword123')
      .expect(200);

    expect(response1.body.staffNo).toBe('123456');

    const response2 = await request(app)
      .get('/protected')
      .auth('999999', 'anotherPassword')
      .expect(200);

    expect(response2.body.staffNo).toBe('999999');
  });
});

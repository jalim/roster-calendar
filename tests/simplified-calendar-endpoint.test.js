/**
 * Integration tests for simplified calendar endpoint
 * GET /api/roster/calendar.ics uses Basic Auth to determine which roster to serve
 */

const request = require('supertest');
const app = require('../src/index');
const authService = require('../src/services/auth-service');
const rosterStore = require('../src/services/roster-store');
const fs = require('fs');
const path = require('path');

// Test credentials file
const TEST_CREDENTIALS_PATH = path.join(__dirname, '../data/test-simplified-endpoint.json');

const testEnv = {
  ROSTER_CREDENTIALS_PATH: TEST_CREDENTIALS_PATH
};

function cleanupTestCredentials() {
  if (fs.existsSync(TEST_CREDENTIALS_PATH)) {
    fs.unlinkSync(TEST_CREDENTIALS_PATH);
  }
}

describe('Simplified Calendar Endpoint', () => {
  beforeEach(async () => {
    cleanupTestCredentials();
    process.env.ROSTER_CREDENTIALS_PATH = TEST_CREDENTIALS_PATH;
    
    // Set up test credentials for two users
    await authService.setPasswordForStaffNo('123456', 'password123', testEnv);
    await authService.setPasswordForStaffNo('999999', 'password999', testEnv);
  });

  afterEach(() => {
    cleanupTestCredentials();
    delete process.env.ROSTER_CREDENTIALS_PATH;
  });

  describe('GET /api/roster/calendar.ics', () => {
    test('should serve calendar based on authenticated staff number', async () => {
      // Upload a roster for user 000000
      const sampleRoster = fs.readFileSync(
        path.join(__dirname, '../examples/sample-roster.txt'),
        'utf-8'
      );
      
      await request(app)
        .post('/api/roster/text')
        .set('Content-Type', 'text/plain')
        .send(sampleRoster)
        .expect(200);

      // Set password for user 000000
      await authService.setPasswordForStaffNo('000000', 'password000', testEnv);

      // Access calendar with authentication
      const response = await request(app)
        .get('/api/roster/calendar.ics')
        .auth('000000', 'password000')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('DOE J Roster');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/roster/calendar.ics')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .get('/api/roster/calendar.ics')
        .auth('123456', 'wrongpassword')
        .expect(401);

      expect(response.body.error).toBe('Authentication failed');
    });

    test('should return 404 if authenticated user has no roster', async () => {
      // User 999999 has credentials but no uploaded roster
      const response = await request(app)
        .get('/api/roster/calendar.ics')
        .auth('999999', 'password999')
        .expect(404);

      expect(response.body.error).toBe('Roster not found');
    });

    test('should serve different rosters for different authenticated users', async () => {
      // Upload roster for user 000000
      const sampleRoster = fs.readFileSync(
        path.join(__dirname, '../examples/sample-roster.txt'),
        'utf-8'
      );
      
      await request(app)
        .post('/api/roster/text')
        .set('Content-Type', 'text/plain')
        .send(sampleRoster)
        .expect(200);

      // Create a modified roster for user 111111
      const modifiedRoster = sampleRoster.replace(/000000/g, '111111').replace(/DOE J/g, 'SMITH A');
      
      await request(app)
        .post('/api/roster/text')
        .set('Content-Type', 'text/plain')
        .send(modifiedRoster)
        .expect(200);

      // Set passwords for both users
      await authService.setPasswordForStaffNo('000000', 'password000', testEnv);
      await authService.setPasswordForStaffNo('111111', 'password111', testEnv);

      // Get roster for user 000000
      const response1 = await request(app)
        .get('/api/roster/calendar.ics')
        .auth('000000', 'password000')
        .expect(200);

      expect(response1.text).toContain('DOE J Roster');
      expect(response1.text).not.toContain('SMITH A Roster');

      // Get roster for user 111111
      const response2 = await request(app)
        .get('/api/roster/calendar.ics')
        .auth('111111', 'password111')
        .expect(200);

      expect(response2.text).toContain('SMITH A Roster');
      expect(response2.text).not.toContain('DOE J Roster');
    });
  });
});

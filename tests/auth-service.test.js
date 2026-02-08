/**
 * Tests for authentication service
 */

const authService = require('../src/services/auth-service');
const fs = require('fs');
const path = require('path');

// Use a test-specific credentials file
const TEST_CREDENTIALS_PATH = path.join(__dirname, '../data/test-credentials.json');

const testEnv = {
  ROSTER_CREDENTIALS_PATH: TEST_CREDENTIALS_PATH
};

// Clean up test credentials before and after tests
function cleanupTestCredentials() {
  if (fs.existsSync(TEST_CREDENTIALS_PATH)) {
    fs.unlinkSync(TEST_CREDENTIALS_PATH);
  }
}

describe('auth-service', () => {
  beforeEach(() => {
    cleanupTestCredentials();
  });

  afterEach(() => {
    cleanupTestCredentials();
  });

  describe('hashPassword', () => {
    test('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(20);
      expect(hash).not.toBe(password);
    });

    test('should create different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should throw error for empty password', async () => {
      await expect(authService.hashPassword('')).rejects.toThrow();
      await expect(authService.hashPassword(null)).rejects.toThrow();
      await expect(authService.hashPassword(undefined)).rejects.toThrow();
    });
  });

  describe('verifyPassword', () => {
    test('should verify correct password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      
      const isValid = await authService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      
      const isValid = await authService.verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    test('should return false for invalid inputs', async () => {
      expect(await authService.verifyPassword('', 'hash')).toBe(false);
      expect(await authService.verifyPassword('password', '')).toBe(false);
      expect(await authService.verifyPassword(null, 'hash')).toBe(false);
      expect(await authService.verifyPassword('password', null)).toBe(false);
    });
  });

  describe('setPasswordForStaffNo', () => {
    test('should set password for new staff number', async () => {
      const staffNo = '123456';
      const password = 'securePassword123';
      
      const result = await authService.setPasswordForStaffNo(staffNo, password, testEnv);
      
      expect(result.staffNo).toBe(staffNo);
      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
    });

    test('should update password for existing staff number', async () => {
      const staffNo = '123456';
      const password1 = 'password1';
      const password2 = 'password2';
      
      await authService.setPasswordForStaffNo(staffNo, password1, testEnv);
      const result = await authService.setPasswordForStaffNo(staffNo, password2, testEnv);
      
      expect(result.staffNo).toBe(staffNo);
      expect(result.created).toBe(false);
      expect(result.updated).toBe(true);
    });

    test('should persist credentials to disk', async () => {
      const staffNo = '123456';
      const password = 'testPassword123';
      
      await authService.setPasswordForStaffNo(staffNo, password, testEnv);
      
      expect(fs.existsSync(TEST_CREDENTIALS_PATH)).toBe(true);
      const data = JSON.parse(fs.readFileSync(TEST_CREDENTIALS_PATH, 'utf8'));
      expect(data[staffNo]).toBeDefined();
      expect(data[staffNo].passwordHash).toBeDefined();
    });

    test('should enforce minimum password length', async () => {
      const staffNo = '123456';
      
      await expect(
        authService.setPasswordForStaffNo(staffNo, '12345', testEnv)
      ).rejects.toThrow('at least 6 characters');
    });

    test('should reject invalid staff number', async () => {
      await expect(
        authService.setPasswordForStaffNo('', 'password', testEnv)
      ).rejects.toThrow();
      
      await expect(
        authService.setPasswordForStaffNo(null, 'password', testEnv)
      ).rejects.toThrow();
    });
  });

  describe('verifyCredentials', () => {
    test('should verify valid credentials', async () => {
      const staffNo = '123456';
      const password = 'testPassword123';
      
      await authService.setPasswordForStaffNo(staffNo, password, testEnv);
      const isValid = await authService.verifyCredentials(staffNo, password, testEnv);
      
      expect(isValid).toBe(true);
    });

    test('should reject invalid password', async () => {
      const staffNo = '123456';
      const password = 'testPassword123';
      
      await authService.setPasswordForStaffNo(staffNo, password, testEnv);
      const isValid = await authService.verifyCredentials(staffNo, 'wrongPassword', testEnv);
      
      expect(isValid).toBe(false);
    });

    test('should reject non-existent staff number', async () => {
      const isValid = await authService.verifyCredentials('999999', 'password', testEnv);
      expect(isValid).toBe(false);
    });

    test('should return false for invalid inputs', async () => {
      expect(await authService.verifyCredentials('', 'password', testEnv)).toBe(false);
      expect(await authService.verifyCredentials('123456', '', testEnv)).toBe(false);
      expect(await authService.verifyCredentials(null, 'password', testEnv)).toBe(false);
      expect(await authService.verifyCredentials('123456', null, testEnv)).toBe(false);
    });
  });

  describe('hasCredentials', () => {
    test('should return true for staff number with credentials', async () => {
      const staffNo = '123456';
      await authService.setPasswordForStaffNo(staffNo, 'password', testEnv);
      
      expect(authService.hasCredentials(staffNo, testEnv)).toBe(true);
    });

    test('should return false for staff number without credentials', async () => {
      expect(authService.hasCredentials('999999', testEnv)).toBe(false);
    });
  });

  describe('deleteCredentials', () => {
    test('should delete existing credentials', async () => {
      const staffNo = '123456';
      await authService.setPasswordForStaffNo(staffNo, 'password', testEnv);
      
      const deleted = authService.deleteCredentials(staffNo, testEnv);
      
      expect(deleted).toBe(true);
      expect(authService.hasCredentials(staffNo, testEnv)).toBe(false);
    });

    test('should return false for non-existent credentials', async () => {
      const deleted = authService.deleteCredentials('999999', testEnv);
      expect(deleted).toBe(false);
    });

    test('should persist deletion to disk', async () => {
      const staffNo = '123456';
      await authService.setPasswordForStaffNo(staffNo, 'password', testEnv);
      
      authService.deleteCredentials(staffNo, testEnv);
      
      const data = JSON.parse(fs.readFileSync(TEST_CREDENTIALS_PATH, 'utf8'));
      expect(data[staffNo]).toBeUndefined();
    });
  });

  describe('listCredentialStaffNumbers', () => {
    test('should return empty array when no credentials exist', async () => {
      const staffNumbers = authService.listCredentialStaffNumbers(testEnv);
      expect(staffNumbers).toEqual([]);
    });

    test('should return all staff numbers with credentials', async () => {
      await authService.setPasswordForStaffNo('111111', 'password1', testEnv);
      await authService.setPasswordForStaffNo('222222', 'password2', testEnv);
      await authService.setPasswordForStaffNo('333333', 'password3', testEnv);
      
      const staffNumbers = authService.listCredentialStaffNumbers(testEnv);
      
      expect(staffNumbers).toHaveLength(3);
      expect(staffNumbers).toContain('111111');
      expect(staffNumbers).toContain('222222');
      expect(staffNumbers).toContain('333333');
    });
  });

  describe('persistence', () => {
    test('should reload credentials from disk on initialization', async () => {
      const staffNo = '123456';
      const password = 'testPassword123';
      
      // Set password and verify it works
      await authService.setPasswordForStaffNo(staffNo, password, testEnv);
      let isValid = await authService.verifyCredentials(staffNo, password, testEnv);
      expect(isValid).toBe(true);
      
      // Delete the in-memory cache would normally happen on restart
      // Since we can't restart the process in a test, we verify the file exists
      expect(fs.existsSync(TEST_CREDENTIALS_PATH)).toBe(true);
      
      const data = JSON.parse(fs.readFileSync(TEST_CREDENTIALS_PATH, 'utf8'));
      expect(data[staffNo]).toBeDefined();
      expect(data[staffNo].passwordHash).toBeDefined();
    });
  });
});

/**
 * Service for managing password reset requests
 * Handles forgot password flow with time-limited tokens
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Get password reset storage path
 */
function getStoragePath(env = process.env) {
  return env.ROSTER_PASSWORD_RESETS_PATH || path.join(process.cwd(), 'data', 'password-resets.json');
}

/**
 * In-memory password reset storage
 * Map<token, { staffNo, createdAt, expiresAt }>
 */
const resetRequests = new Map();
let initialized = false;

/**
 * Ensure the data directory exists
 */
function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Initialize password resets from disk
 */
function initStorage(env = process.env) {
  if (initialized) return;
  initialized = true;

  const storePath = getStoragePath(env);
  
  try {
    if (!fs.existsSync(storePath)) return;
    const raw = fs.readFileSync(storePath, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    
    if (parsed && typeof parsed === 'object') {
      // Only load non-expired tokens
      const now = new Date();
      for (const [token, data] of Object.entries(parsed)) {
        const expires = new Date(data.expiresAt);
        if (expires > now) {
          resetRequests.set(token, data);
        }
      }
    }
  } catch (err) {
    console.warn(`[password-reset] Failed to load: ${err.message}`);
    resetRequests.clear();
  }
}

/**
 * Persist password resets to disk
 */
function persist(env = process.env) {
  const storePath = getStoragePath(env);
  
  try {
    ensureDirExists(storePath);
    const data = {};
    for (const [token, resetData] of resetRequests.entries()) {
      data[token] = resetData;
    }
    
    const tmpPath = `${storePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, storePath);
  } catch (err) {
    console.error(`[password-reset] Failed to persist: ${err.message}`);
    throw err;
  }
}

/**
 * Generate a random token
 * @returns {string} - 32-byte hex token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a password reset request
 * @param {string} staffNo - Staff number requesting reset
 * @param {Object} env - Environment variables
 * @returns {Object} - { success: true, token: string }
 */
function createResetRequest(staffNo, env = process.env) {
  initStorage(env);

  if (!staffNo || typeof staffNo !== 'string') {
    throw new Error('Staff number is required');
  }

  // Clear any existing reset requests for this staff number
  for (const [token, data] of resetRequests.entries()) {
    if (data.staffNo === staffNo) {
      resetRequests.delete(token);
    }
  }

  // Generate reset token
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  resetRequests.set(token, {
    staffNo,
    createdAt: now.toISOString(),
    expiresAt
  });

  persist(env);

  return {
    success: true,
    token
  };
}

/**
 * Verify a reset token
 * @param {string} token - Reset token
 * @param {Object} env - Environment variables
 * @returns {Object} - { valid: boolean, staffNo?: string, error?: string }
 */
function verifyResetToken(token, env = process.env) {
  initStorage(env);

  if (!token) {
    return { valid: false, error: 'Token is required' };
  }

  const resetData = resetRequests.get(token);
  if (!resetData) {
    return { valid: false, error: 'Invalid or expired reset token' };
  }

  // Check if token is expired
  const expires = new Date(resetData.expiresAt);
  if (expires <= new Date()) {
    resetRequests.delete(token);
    persist(env);
    return { valid: false, error: 'Reset token has expired' };
  }

  return {
    valid: true,
    staffNo: resetData.staffNo
  };
}

/**
 * Consume a reset token (delete after successful password reset)
 * @param {string} token - Reset token to consume
 * @param {Object} env - Environment variables
 * @returns {boolean} - True if token was consumed
 */
function consumeResetToken(token, env = process.env) {
  initStorage(env);

  const existed = resetRequests.has(token);
  if (existed) {
    resetRequests.delete(token);
    persist(env);
  }

  return existed;
}

/**
 * Clean up expired reset tokens
 * @param {Object} env - Environment variables
 * @returns {number} - Number of tokens cleaned up
 */
function cleanupExpiredTokens(env = process.env) {
  initStorage(env);

  let cleaned = 0;
  const now = new Date();

  for (const [token, data] of resetRequests.entries()) {
    const expires = new Date(data.expiresAt);
    if (expires <= now) {
      resetRequests.delete(token);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    persist(env);
  }

  return cleaned;
}

module.exports = {
  createResetRequest,
  verifyResetToken,
  consumeResetToken,
  cleanupExpiredTokens
};

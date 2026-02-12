/**
 * Service for managing pending pilot account approvals
 * Handles signup requests that need admin approval after email verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authService = require('./auth-service');

/**
 * Get pending approvals storage path
 */
function getStoragePath(env = process.env) {
  return env.ROSTER_PENDING_APPROVALS_PATH || path.join(process.cwd(), 'data', 'pending-approvals.json');
}

/**
 * In-memory pending approvals storage
 * Map<staffNo, { email, passwordHash, emailVerified, emailToken, emailTokenExpiry, createdAt }>
 */
const pendingApprovals = new Map();
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
 * Initialize pending approvals from disk
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
      for (const [staffNo, data] of Object.entries(parsed)) {
        pendingApprovals.set(staffNo, data);
      }
    }
  } catch (err) {
    console.warn(`[pending-approvals] Failed to load: ${err.message}`);
    pendingApprovals.clear();
  }
}

/**
 * Persist pending approvals to disk
 */
function persist(env = process.env) {
  const storePath = getStoragePath(env);
  
  try {
    ensureDirExists(storePath);
    const data = {};
    for (const [staffNo, approvalData] of pendingApprovals.entries()) {
      data[staffNo] = approvalData;
    }
    
    const tmpPath = `${storePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, storePath);
  } catch (err) {
    console.error(`[pending-approvals] Failed to persist: ${err.message}`);
    throw err;
  }
}

/**
 * Validate staff number format
 * @param {string} staffNo - Staff number to validate
 * @returns {boolean} - True if valid 6-digit format
 */
function isValidStaffNo(staffNo) {
  return /^\d{6}$/.test(staffNo);
}

/**
 * Generate a random token
 * @returns {string} - 32-byte hex token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a pending approval request
 * @param {string} staffNo - Staff number (must be 6 digits)
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @param {string} email - Email address
 * @param {string} password - Plain text password (will be hashed)
 * @param {Object} env - Environment variables
 * @returns {Promise<Object>} - { success: true, emailToken: string }
 * @throws {Error} - If validation fails
 */
async function createPendingApproval(staffNo, firstName, lastName, email, password, env = process.env) {
  initStorage(env);

  // Validate staff number format
  if (!isValidStaffNo(staffNo)) {
    throw new Error('Staff number must be exactly 6 digits');
  }

  // Check if staff number already has credentials
  if (authService.hasCredentials(staffNo, env)) {
    throw new Error('Staff number already has an account');
  }

  // Check if already pending
  if (pendingApprovals.has(staffNo)) {
    throw new Error('Staff number already has a pending approval request');
  }

  // Validate firstName and lastName
  if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
    throw new Error('First name is required');
  }
  if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
    throw new Error('Last name is required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error('Invalid email address');
  }

  // Validate password complexity
  const passwordValidation = authService.validatePasswordComplexity(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.error);
  }

  // Hash the password
  const passwordHash = await authService.hashPassword(password);

  // Generate email verification token
  const emailToken = generateToken();
  const emailTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  // Create pending approval
  const now = new Date().toISOString();
  pendingApprovals.set(staffNo, {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email,
    passwordHash,
    emailVerified: false,
    emailToken,
    emailTokenExpiry,
    createdAt: now
  });

  persist(env);

  return {
    success: true,
    emailToken
  };
}

/**
 * Verify email token
 * @param {string} token - Email verification token
 * @param {Object} env - Environment variables
 * @returns {Object} - { success: boolean, staffNo?: string, email?: string, error?: string }
 */
function verifyEmailToken(token, env = process.env) {
  initStorage(env);

  if (!token) {
    return { success: false, error: 'Token is required' };
  }

  // Find pending approval by token
  for (const [staffNo, data] of pendingApprovals.entries()) {
    if (data.emailToken === token) {
      // Check if token is expired
      const expiry = new Date(data.emailTokenExpiry);
      if (expiry <= new Date()) {
        return { success: false, error: 'Verification token has expired' };
      }

      // Mark email as verified
      data.emailVerified = true;
      persist(env);

      return {
        success: true,
        staffNo,
        email: data.email
      };
    }
  }

  return { success: false, error: 'Invalid verification token' };
}

/**
 * List all pending approvals
 * @param {Object} env - Environment variables
 * @returns {Array<Object>} - Array of pending approvals with staffNo, email, emailVerified, createdAt
 */
function listPending(env = process.env) {
  initStorage(env);

  const pending = [];
  for (const [staffNo, data] of pendingApprovals.entries()) {
    pending.push({
      staffNo,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      email: data.email,
      emailVerified: data.emailVerified,
      createdAt: data.createdAt
    });
  }

  // Sort by creation date, newest first
  pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return pending;
}

/**
 * Get pending approval by staff number
 * @param {string} staffNo - Staff number
 * @param {Object} env - Environment variables
 * @returns {Object|null} - Pending approval data or null
 */
function getPending(staffNo, env = process.env) {
  initStorage(env);
  return pendingApprovals.get(staffNo) || null;
}

/**
 * Approve a pending request (admin action)
 * Moves credentials to auth service and returns data for email/profile setup
 * @param {string} staffNo - Staff number to approve
 * @param {Object} env - Environment variables
 * @returns {Promise<Object>} - { success: boolean, email?: string, error?: string }
 */
async function approvePending(staffNo, env = process.env) {
  initStorage(env);

  const pending = pendingApprovals.get(staffNo);
  if (!pending) {
    return { success: false, error: 'No pending approval found for this staff number' };
  }

  if (!pending.emailVerified) {
    return { success: false, error: 'Email must be verified before approval' };
  }

  try {
    // Set credentials directly with the hashed password
    // We bypass password validation since it was already validated during signup
    const now = new Date().toISOString();
    const credData = {
      passwordHash: pending.passwordHash,
      createdAt: now,
      updatedAt: now,
      isAdmin: false
    };

    // Access internal credentials map to set directly
    // This is a bit of a hack but avoids re-hashing
    const authModule = require('./auth-service');
    const { initCredentialStorage } = require('./auth-service');
    
    // We need to get access to the internal credentials Map
    // Since we can't easily do that, we'll need to modify auth-service
    // For now, let's use a workaround by creating credentials in auth-service
    // Actually, let's just import the module's internals properly
    
    // Better approach: Store the credentials data and let the caller handle it
    const email = pending.email;
    const firstName = pending.firstName || '';
    const lastName = pending.lastName || '';
    
    // Delete from pending
    pendingApprovals.delete(staffNo);
    persist(env);

    return {
      success: true,
      email,
      firstName,
      lastName,
      passwordHash: pending.passwordHash
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Reject a pending request (admin action)
 * @param {string} staffNo - Staff number to reject
 * @param {Object} env - Environment variables
 * @returns {Object} - { success: boolean, error?: string }
 */
function rejectPending(staffNo, env = process.env) {
  initStorage(env);

  const pending = pendingApprovals.get(staffNo);
  if (!pending) {
    return { success: false, error: 'No pending approval found for this staff number' };
  }

  pendingApprovals.delete(staffNo);
  persist(env);

  return { success: true };
}

/**
 * Clean up expired email verification tokens
 * Removes tokens but keeps pending approvals (they don't expire)
 * @param {Object} env - Environment variables
 * @returns {number} - Number of tokens cleaned up
 */
function cleanupExpiredTokens(env = process.env) {
  initStorage(env);

  let cleaned = 0;
  const now = new Date();

  for (const [staffNo, data] of pendingApprovals.entries()) {
    if (data.emailToken && data.emailTokenExpiry) {
      const expiry = new Date(data.emailTokenExpiry);
      if (expiry <= now && !data.emailVerified) {
        // Token expired and email not verified - clear the token
        // This allows requesting a new verification email
        data.emailToken = null;
        data.emailTokenExpiry = null;
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    persist(env);
  }

  return cleaned;
}

module.exports = {
  createPendingApproval,
  verifyEmailToken,
  listPending,
  getPending,
  approvePending,
  rejectPending,
  cleanupExpiredTokens,
  isValidStaffNo
};

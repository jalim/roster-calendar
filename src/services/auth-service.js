/**
 * Authentication service for password hashing and verification
 * Uses bcryptjs for secure password hashing with salt rounds
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Use 12 salt rounds for a good balance of security and performance
const SALT_ROUNDS = 12;

/**
 * Validate password complexity
 * @param {string} password - Plain text password
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validatePasswordComplexity(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password must be a non-empty string' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }

  // Require at least one uppercase, one lowercase, and one number
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (!hasUpperCase) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!hasLowerCase) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!hasNumber) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  return { valid: true };
}

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches hash
 */
async function verifyPassword(password, hash) {
  if (!password || !hash) {
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch (err) {
    return false;
  }
}

/**
 * Get credential storage configuration
 */
function getCredentialStorageConfig(env = process.env) {
  const storePath = env.ROSTER_CREDENTIALS_PATH || path.join(process.cwd(), 'data', 'credentials.json');
  return { storePath };
}

/**
 * In-memory credential storage
 * Map<staffNo, { passwordHash: string, createdAt: string, updatedAt: string }>
 */
const credentials = new Map();
let credentialsInitialized = false;

/**
 * Ensure the data directory exists
 */
function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Initialize credential storage from disk
 */
function initCredentialStorage(env = process.env) {
  if (credentialsInitialized) return;
  credentialsInitialized = true;

  const { storePath } = getCredentialStorageConfig(env);
  
  try {
    if (!fs.existsSync(storePath)) return;
    const raw = fs.readFileSync(storePath, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    
    if (parsed && typeof parsed === 'object') {
      for (const [staffNo, credData] of Object.entries(parsed)) {
        credentials.set(staffNo, credData);
      }
    }
  } catch (err) {
    console.warn(`[auth] Failed to load credentials from ${storePath}: ${err.message}`);
    // Start with empty credentials on error
    credentials.clear();
  }
}

/**
 * Persist credentials to disk
 */
function persistCredentials(env = process.env) {
  const { storePath } = getCredentialStorageConfig(env);
  
  try {
    ensureDirExists(storePath);
    const data = {};
    for (const [staffNo, credData] of credentials.entries()) {
      data[staffNo] = credData;
    }
    
    const tmpPath = `${storePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, storePath);
  } catch (err) {
    console.error(`[auth] Failed to persist credentials: ${err.message}`);
    throw err;
  }
}

/**
 * Set password for a staff number
 * @param {string} staffNo - Staff number
 * @param {string} password - Plain text password
 * @param {Object} env - Environment variables
 * @returns {Promise<Object>} - Result object
 */
async function setPasswordForStaffNo(staffNo, password, env = process.env) {
  if (!staffNo || typeof staffNo !== 'string') {
    throw new Error('Staff number must be a non-empty string');
  }
  
  // Validate password complexity
  const validation = validatePasswordComplexity(password);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  initCredentialStorage(env);
  
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const isNew = !credentials.has(staffNo);
  const existingData = credentials.get(staffNo);
  
  credentials.set(staffNo, {
    passwordHash,
    // Preserve original createdAt and isAdmin on updates
    createdAt: isNew ? now : (existingData?.createdAt || now),
    updatedAt: now,
    isAdmin: isNew ? false : (existingData?.isAdmin || false)
  });
  
  persistCredentials(env);
  
  return {
    staffNo,
    created: isNew,
    updated: !isNew
  };
}

/**
 * Verify credentials for a staff number
 * @param {string} staffNo - Staff number
 * @param {string} password - Plain text password
 * @param {Object} env - Environment variables
 * @returns {Promise<boolean>} - True if credentials are valid
 */
async function verifyCredentials(staffNo, password, env = process.env) {
  if (!staffNo || !password) {
    return false;
  }

  initCredentialStorage(env);
  
  const credData = credentials.get(staffNo);
  if (!credData || !credData.passwordHash) {
    return false;
  }
  
  return verifyPassword(password, credData.passwordHash);
}

/**
 * Check if a staff number has credentials set
 * @param {string} staffNo - Staff number
 * @param {Object} env - Environment variables
 * @returns {boolean} - True if credentials exist
 */
function hasCredentials(staffNo, env = process.env) {
  initCredentialStorage(env);
  return credentials.has(staffNo);
}

/**
 * Delete credentials for a staff number
 * @param {string} staffNo - Staff number
 * @param {Object} env - Environment variables
 * @returns {boolean} - True if credentials were deleted
 */
function deleteCredentials(staffNo, env = process.env) {
  initCredentialStorage(env);
  
  const existed = credentials.has(staffNo);
  if (existed) {
    credentials.delete(staffNo);
    persistCredentials(env);
  }
  
  return existed;
}

/**
 * List all staff numbers with credentials (for admin/debug)
 * @param {Object} env - Environment variables
 * @returns {Array<string>} - Array of staff numbers
 */
function listCredentialStaffNumbers(env = process.env) {
  initCredentialStorage(env);
  return Array.from(credentials.keys());
}

/**
 * Check if a staff number has admin privileges
 * @param {string} staffNo - Staff number
 * @param {Object} env - Environment variables
 * @returns {boolean} - True if staff number is admin
 */
function isAdmin(staffNo, env = process.env) {
  if (!staffNo) return false;
  
  initCredentialStorage(env);
  const credData = credentials.get(staffNo);
  return credData?.isAdmin === true;
}

/**
 * Get all admin staff numbers
 * @param {Object} env - Environment variables
 * @returns {Array<string>} - Array of admin staff numbers
 */
function getAdminStaffNumbers(env = process.env) {
  initCredentialStorage(env);
  const admins = [];
  for (const [staffNo, credData] of credentials.entries()) {
    if (credData.isAdmin === true) {
      admins.push(staffNo);
    }
  }
  return admins;
}

/**
 * Bootstrap admin privileges for a staff number
 * Creates credentials if they don't exist, or adds admin flag if they do
 * @param {string} staffNo - Staff number to make admin
 * @param {Object} env - Environment variables
 * @returns {boolean} - True if admin was bootstrapped
 */
function bootstrapAdmin(staffNo, env = process.env) {
  if (!staffNo || typeof staffNo !== 'string') {
    return false;
  }

  initCredentialStorage(env);
  
  const now = new Date().toISOString();
  const existingData = credentials.get(staffNo);
  
  if (existingData) {
    // Already has credentials, just add admin flag if not present
    if (existingData.isAdmin !== true) {
      credentials.set(staffNo, {
        ...existingData,
        isAdmin: true,
        updatedAt: now
      });
      persistCredentials(env);
      return true;
    }
    return false; // Already admin
  }
  
  // No credentials exist - this shouldn't happen in normal flow
  // Admin should have credentials before being bootstrapped
  return false;
}

/**
 * Get admin emails from pilot directory
 * @param {Object} env - Environment variables
 * @returns {Array<string>} - Array of admin email addresses
 */
function getAdminEmails(env = process.env) {
  const pilotDirectory = require('./pilot-directory');
  const adminStaffNumbers = getAdminStaffNumbers(env);
  const emails = [];
  
  for (const staffNo of adminStaffNumbers) {
    const email = pilotDirectory.getEmailForStaffNo(staffNo);
    if (email) {
      emails.push(email);
    }
  }
  
  return emails;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  setPasswordForStaffNo,
  verifyCredentials,
  hasCredentials,
  deleteCredentials,
  listCredentialStaffNumbers,
  isAdmin,
  getAdminStaffNumbers,
  getAdminEmails,
  bootstrapAdmin
};

/**
 * File-based session store for express-session
 * Persists sessions to a JSON file for alpha phase
 */

const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.storePath = options.storePath || path.join(process.cwd(), 'data', 'sessions.json');
    this.sessions = new Map();
    this.ttl = options.ttl || 86400000; // 24 hours default
    this.initialized = false;
  }

  /**
   * Ensure data directory exists
   */
  ensureDirExists() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Initialize from disk
   */
  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      this.ensureDirExists();
      if (!fs.existsSync(this.storePath)) return;
      
      const raw = fs.readFileSync(this.storePath, 'utf8');
      if (!raw) return;
      
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [sid, sessionData] of Object.entries(parsed)) {
          // Only load non-expired sessions
          if (sessionData.cookie && sessionData.cookie.expires) {
            const expires = new Date(sessionData.cookie.expires);
            if (expires > new Date()) {
              this.sessions.set(sid, sessionData);
            }
          } else {
            this.sessions.set(sid, sessionData);
          }
        }
      }
    } catch (err) {
      console.warn(`[session-store] Failed to load sessions: ${err.message}`);
      this.sessions.clear();
    }
  }

  /**
   * Persist sessions to disk
   */
  persist() {
    try {
      this.ensureDirExists();
      const data = {};
      for (const [sid, sessionData] of this.sessions.entries()) {
        data[sid] = sessionData;
      }
      
      const tmpPath = `${this.storePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.storePath);
    } catch (err) {
      console.error(`[session-store] Failed to persist sessions: ${err.message}`);
    }
  }

  /**
   * Get session by ID
   */
  get(sid, callback) {
    this.initialize();
    
    try {
      const sessionData = this.sessions.get(sid);
      if (!sessionData) {
        return callback(null, null);
      }

      // Check expiration
      if (sessionData.cookie && sessionData.cookie.expires) {
        const expires = new Date(sessionData.cookie.expires);
        if (expires <= new Date()) {
          this.sessions.delete(sid);
          this.persist();
          return callback(null, null);
        }
      }

      callback(null, sessionData);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Set session
   */
  set(sid, session, callback) {
    this.initialize();
    
    try {
      this.sessions.set(sid, session);
      this.persist();
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Destroy session
   */
  destroy(sid, callback) {
    this.initialize();
    
    try {
      this.sessions.delete(sid);
      this.persist();
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Touch session to update expiration
   */
  touch(sid, session, callback) {
    this.initialize();
    
    try {
      const sessionData = this.sessions.get(sid);
      if (sessionData) {
        sessionData.cookie = session.cookie;
        this.persist();
      }
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Get all session IDs
   */
  all(callback) {
    this.initialize();
    
    try {
      const sessions = Array.from(this.sessions.entries()).map(([sid, session]) => ({ sid, session }));
      callback(null, sessions);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Clear all sessions
   */
  clear(callback) {
    try {
      this.sessions.clear();
      this.persist();
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Get session count
   */
  length(callback) {
    this.initialize();
    
    try {
      callback(null, this.sessions.size);
    } catch (err) {
      callback(err);
    }
  }
}

/**
 * Get or generate session secret
 */
function getSessionSecret(env = process.env) {
  const secretPath = path.join(process.cwd(), 'data', 'session-secret.txt');
  
  // Check environment variable first
  if (env.ROSTER_SESSION_SECRET) {
    return env.ROSTER_SESSION_SECRET;
  }

  // Try to load existing secret
  try {
    if (fs.existsSync(secretPath)) {
      const secret = fs.readFileSync(secretPath, 'utf8').trim();
      if (secret && secret.length >= 32) {
        return secret;
      }
    }
  } catch (err) {
    console.warn(`[session] Failed to load session secret: ${err.message}`);
  }

  // Generate new secret
  const secret = crypto.randomBytes(32).toString('hex');
  
  try {
    const dir = path.dirname(secretPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(secretPath, secret, 'utf8');
    console.log(`[session] Generated new session secret at ${secretPath}`);
  } catch (err) {
    console.warn(`[session] Failed to save session secret: ${err.message}`);
  }

  return secret;
}

module.exports = {
  FileSessionStore,
  getSessionSecret
};

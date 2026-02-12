/**
 * Middleware to require admin privileges
 * Must be used after requireAuth
 */

const authService = require('../services/auth-service');

/**
 * Require admin middleware
 * Returns 403 if user is not an admin
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.staffNo) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user has admin privileges
  const isAdmin = authService.isAdmin(req.session.staffNo);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  next();
}

module.exports = {
  requireAdmin
};

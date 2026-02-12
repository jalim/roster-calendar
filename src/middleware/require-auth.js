/**
 * Middleware to require authentication
 * Checks if user is logged in via session
 */

/**
 * Require authentication middleware
 * Redirects to login if not authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.staffNo) {
    // Store the original URL to redirect back after login
    req.session.returnTo = req.originalUrl || req.url;
    return res.redirect('/login');
  }

  // Set user info on res.locals for templates
  res.locals.currentUser = {
    staffNo: req.session.staffNo,
    isAdmin: req.session.isAdmin || false
  };

  next();
}

/**
 * Optional authentication middleware
 * Sets user info if authenticated but doesn't require it
 */
function optionalAuth(req, res, next) {
  if (req.session && req.session.staffNo) {
    res.locals.currentUser = {
      staffNo: req.session.staffNo,
      isAdmin: req.session.isAdmin || false
    };
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};

/**
 * Middleware to require authentication
 * Checks if user is logged in via session
 */

const authService = require('../services/auth-service');
const pilotDirectory = require('../services/pilot-directory');

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

  // Only set currentUser if not already set by view-helpers
  if (!res.locals.currentUser) {
    res.locals.currentUser = {
      staffNo: req.session.staffNo,
      isAdmin: authService.isAdmin(req.session.staffNo)
    };

    // Get user's email
    const email = pilotDirectory.getEmailForStaffNo(req.session.staffNo);
    if (email) {
      res.locals.currentUser.email = email;
    }

    // Get user's name
    const names = pilotDirectory.getNamesForStaffNo(req.session.staffNo);
    if (names) {
      res.locals.currentUser.firstName = names.firstName;
      res.locals.currentUser.lastName = names.lastName;
    }
  }

  next();
}

/**
 * Optional authentication middleware
 * Sets user info if authenticated but doesn't require it
 */
function optionalAuth(req, res, next) {
  // Only set currentUser if not already set by view-helpers
  if (req.session && req.session.staffNo && !res.locals.currentUser) {
    res.locals.currentUser = {
      staffNo: req.session.staffNo,
      isAdmin: authService.isAdmin(req.session.staffNo)
    };

    // Get user's email
    const email = pilotDirectory.getEmailForStaffNo(req.session.staffNo);
    if (email) {
      res.locals.currentUser.email = email;
    }

    // Get user's name
    const names = pilotDirectory.getNamesForStaffNo(req.session.staffNo);
    if (names) {
      res.locals.currentUser.firstName = names.firstName;
      res.locals.currentUser.lastName = names.lastName;
    }
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};

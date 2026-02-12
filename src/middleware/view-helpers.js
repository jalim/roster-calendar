/**
 * View helpers middleware
 * Sets up common template variables and helper functions
 */

const authService = require('../services/auth-service');
const pilotDirectory = require('../services/pilot-directory');

/**
 * View helpers middleware
 * Populates res.locals with helper functions and common data
 */
function viewHelpers(req, res, next) {
  // Set current user if authenticated
  if (req.session && req.session.staffNo) {
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
  } else {
    res.locals.currentUser = null;
  }

  // Flash messages (from session)
  res.locals.messages = req.session.messages || {};
  // Clear messages after rendering
  if (req.session.messages) {
    delete req.session.messages;
  }

  // Helper function to set flash messages
  req.flash = function(type, message) {
    if (!req.session.messages) {
      req.session.messages = {};
    }
    if (!req.session.messages[type]) {
      req.session.messages[type] = [];
    }
    req.session.messages[type].push(message);
  };

  // CSRF token (will be set by csurf middleware)
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;

  next();
}

module.exports = {
  viewHelpers
};

/**
 * CalDAV Authentication Middleware
 * Implements HTTP Basic Authentication for calendar access
 */

const auth = require('basic-auth');
const { verifyCredentials } = require('../services/auth-service');

/**
 * Middleware to authenticate CalDAV requests using HTTP Basic Auth
 * Username should be the staff number, password is verified against stored hash
 */
async function authenticateCalDAV(req, res, next) {
  // Extract credentials from Authorization header
  const credentials = auth(req);
  
  if (!credentials || !credentials.name || !credentials.pass) {
    // No credentials provided - send 401 with WWW-Authenticate header
    res.setHeader('WWW-Authenticate', 'Basic realm="Roster Calendar"');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please provide your staff number as username and password'
    });
  }

  const staffNo = credentials.name;
  const password = credentials.pass;
  
  // Verify credentials
  const isValid = await verifyCredentials(staffNo, password, process.env);
  
  if (!isValid) {
    // Invalid credentials - send 401
    res.setHeader('WWW-Authenticate', 'Basic realm="Roster Calendar"');
    return res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Invalid staff number or password'
    });
  }
  
  // Authentication successful - attach staff number to request
  req.authenticatedStaffNo = staffNo;
  next();
}

/**
 * Middleware to optionally authenticate and attach staffNo if valid
 * Does not reject unauthenticated requests
 */
async function optionalCalDAVAuth(req, res, next) {
  const credentials = auth(req);
  
  if (credentials && credentials.name && credentials.pass) {
    const isValid = await verifyCredentials(credentials.name, credentials.pass, process.env);
    if (isValid) {
      req.authenticatedStaffNo = credentials.name;
    }
  }
  
  next();
}

module.exports = {
  authenticateCalDAV,
  optionalCalDAVAuth
};

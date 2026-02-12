/**
 * Admin routes
 * Handles admin approval workflow
 */

const express = require('express');
const router = express.Router();

const authService = require('../services/auth-service');
const pendingApprovals = require('../services/pending-approvals');
const pilotDirectory = require('../services/pilot-directory');
const { sendEmail } = require('../services/outbound-email-service');
const { createLogger } = require('../services/logger');
const { requireAdmin } = require('../middleware/require-admin');

const logger = createLogger({ component: 'admin-routes' });

/**
 * GET /admin/login - Show admin login form
 */
router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login' });
});

/**
 * POST /admin/login - Handle admin login
 */
router.post('/login', async (req, res) => {
  const { staffNo, password } = req.body;

  try {
    // Verify credentials
    const valid = await authService.verifyCredentials(staffNo, password);
    if (!valid) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/admin/login');
    }

    // Check if user is admin
    if (!authService.isAdmin(staffNo)) {
      req.flash('error', 'Admin privileges required');
      return res.redirect('/admin/login');
    }

    // Set session
    req.session.staffNo = staffNo;
    req.session.isAdmin = true;

    logger.info('[admin-login] Admin logged in', { staffNo });
    res.redirect('/admin/approvals');
  } catch (err) {
    logger.error('[admin-login] Error', { error: err.message });
    req.flash('error', 'An error occurred during login');
    res.redirect('/admin/login');
  }
});

/**
 * GET /admin/approvals - List pending approvals (admin only)
 */
router.get('/approvals', requireAdmin, (req, res) => {
  try {
    const pending = pendingApprovals.listPending();
    res.render('admin/approvals', { 
      title: 'Pending Approvals',
      pendingApprovals: pending
    });
  } catch (err) {
    logger.error('[admin-approvals] Error', { error: err.message });
    req.flash('error', 'Failed to load pending approvals');
    res.redirect('/dashboard');
  }
});

/**
 * POST /admin/approvals/:staffNo/approve - Approve a pending request (admin only)
 */
router.post('/approvals/:staffNo/approve', requireAdmin, async (req, res) => {
  const { staffNo } = req.params;

  try {
    const result = await pendingApprovals.approvePending(staffNo);

    if (!result.success) {
      req.flash('error', result.error);
      return res.redirect('/admin/approvals');
    }

    // Now set the credentials using the returned passwordHash
    // We need to do this manually since we already have the hash
    const { email, firstName, lastName, passwordHash } = result;

    // Get internal access to set credentials with existing hash
    // We'll need to modify auth-service to support this, or do it here
    // For now, let's manually set it
    const authServiceModule = require('../services/auth-service');
    const fs = require('fs');
    const path = require('path');
    
    // Read credentials file
    const credPath = process.env.ROSTER_CREDENTIALS_PATH || path.join(process.cwd(), 'data', 'credentials.json');
    let credentials = {};
    if (fs.existsSync(credPath)) {
      credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    }
    
    // Add new credentials
    const now = new Date().toISOString();
    credentials[staffNo] = {
      passwordHash,
      createdAt: now,
      updatedAt: now,
      isAdmin: false
    };
    
    // Save credentials
    const dir = path.dirname(credPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${credPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(credentials, null, 2), 'utf8');
    fs.renameSync(tmpPath, credPath);

    // Set email in pilot directory
    pilotDirectory.setEmailForStaffNo(staffNo, email);

    // Set names in pilot directory
    if (firstName && lastName) {
      pilotDirectory.setNamesForStaffNo(staffNo, firstName, lastName);
    }

    // Send welcome email
    await sendEmail({
      to: email,
      subject: 'Account Approved - Roster Calendar',
      text: `Good news! Your Roster Calendar account has been approved.

Staff Number: ${staffNo}

You can now log in at: ${req.protocol}://${req.get('host')}/login

Once logged in, you'll be able to:
- Subscribe to your roster calendar
- Share a public calendar with family/friends
- Manage your account settings

Welcome aboard!`
    }).catch(err => {
      logger.error('[admin-approve] Failed to send welcome email', { error: err.message });
    });

    logger.info('[admin-approve] Account approved', { staffNo, email });
    req.flash('success', `Account ${staffNo} approved successfully`);
    res.redirect('/admin/approvals');
  } catch (err) {
    logger.error('[admin-approve] Error', { error: err.message, staffNo });
    req.flash('error', 'Failed to approve account');
    res.redirect('/admin/approvals');
  }
});

/**
 * POST /admin/approvals/:staffNo/reject - Reject a pending request (admin only)
 */
router.post('/approvals/:staffNo/reject', requireAdmin, (req, res) => {
  const { staffNo } = req.params;

  try {
    const result = pendingApprovals.rejectPending(staffNo);

    if (!result.success) {
      req.flash('error', result.error);
    } else {
      logger.info('[admin-reject] Account rejected', { staffNo });
      req.flash('success', `Request from ${staffNo} rejected and deleted`);
    }

    res.redirect('/admin/approvals');
  } catch (err) {
    logger.error('[admin-reject] Error', { error: err.message, staffNo });
    req.flash('error', 'Failed to reject request');
    res.redirect('/admin/approvals');
  }
});

module.exports = router;

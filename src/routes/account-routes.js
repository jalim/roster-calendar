/**
 * Account management routes
 * Handles profile and password changes for authenticated users
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const authService = require('../services/auth-service');
const pilotDirectory = require('../services/pilot-directory');
const { createLogger } = require('../services/logger');
const { requireAuth } = require('../middleware/require-auth');

const logger = createLogger({ component: 'account-routes' });

// All account routes require authentication
router.use(requireAuth);

/**
 * GET /account/profile - Show profile page
 */
router.get('/profile', (req, res) => {
  res.render('account/profile', { title: 'Profile' });
});

/**
 * POST /account/profile - Update profile
 */
router.post('/profile', [
  body('email').isEmail().withMessage('Invalid email address')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/account/profile');
  }

  const { email } = req.body;
  const staffNo = req.session.staffNo;

  try {
    // Update email
    pilotDirectory.setEmailForStaffNo(staffNo, email);

    logger.info('[account-profile] Email updated', { staffNo, email });
    req.flash('success', 'Profile updated successfully');
    res.redirect('/account/profile');
  } catch (err) {
    logger.error('[account-profile] Error', { error: err.message, staffNo });
    req.flash('error', 'Failed to update profile');
    res.redirect('/account/profile');
  }
});

/**
 * GET /account/password - Show password change form
 */
router.get('/password', (req, res) => {
  res.render('account/password', { title: 'Change Password' });
});

/**
 * POST /account/password - Handle password change
 */
router.post('/password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/account/password');
  }

  const { currentPassword, newPassword } = req.body;
  const staffNo = req.session.staffNo;

  try {
    // Verify current password
    const valid = await authService.verifyCredentials(staffNo, currentPassword);
    if (!valid) {
      req.flash('error', 'Current password is incorrect');
      return res.redirect('/account/password');
    }

    // Set new password
    await authService.setPasswordForStaffNo(staffNo, newPassword);

    logger.info('[account-password] Password changed', { staffNo });
    req.flash('success', 'Password changed successfully');
    res.redirect('/dashboard');
  } catch (err) {
    logger.error('[account-password] Error', { error: err.message, staffNo });
    req.flash('error', err.message);
    res.redirect('/account/password');
  }
});

module.exports = router;

/**
 * Authentication routes
 * Handles signup, login, logout, password reset, and email verification
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const authService = require('../services/auth-service');
const pendingApprovals = require('../services/pending-approvals');
const passwordReset = require('../services/password-reset');
const pilotDirectory = require('../services/pilot-directory');
const { sendEmail } = require('../services/outbound-email-service');
const { createLogger } = require('../services/logger');

const logger = createLogger({ component: 'auth-routes' });

/**
 * GET /signup - Show signup form
 */
router.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign Up' });
});

/**
 * POST /signup - Handle signup submission
 */
router.post('/signup', [
  body('staffNo').matches(/^\d{6}$/).withMessage('Staff number must be exactly 6 digits'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/signup');
  }

  const { staffNo, firstName, lastName, email, password } = req.body;

  try {
    // Create pending approval
    const result = await pendingApprovals.createPendingApproval(staffNo, firstName, lastName, email, password);

    // Send verification email to pilot
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify-email/${result.emailToken}`;
    await sendEmail({
      to: email,
      subject: 'Verify your email - Roster Calendar',
      text: `Welcome to Roster Calendar!

Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire in 24 hours.

After verification, your account will need to be approved by an administrator before you can log in.

If you didn't create this account, please ignore this email.`
    }).catch(err => {
      logger.error('[signup] Failed to send verification email', { error: err.message });
    });

    // Send admin notification immediately
    const adminEmails = authService.getAdminEmails();
    if (adminEmails.length > 0) {
      await sendEmail({
        to: adminEmails.join(', '),
        subject: 'New Account Signup - Roster Calendar',
        text: `A new pilot has signed up for Roster Calendar:

Name: ${firstName} ${lastName}
Staff Number: ${staffNo}
Email: ${email}

The pilot needs to verify their email address before you can approve the account.

You can manage pending approvals at: ${req.protocol}://${req.get('host')}/admin/approvals`
      }).catch(err => {
        logger.error('[signup] Failed to send admin notification', { error: err.message });
      });
    }

    req.flash('success', 'Signup successful! Please check your email to verify your address.');
    res.redirect('/login');
  } catch (err) {
    logger.error('[signup] Error', { error: err.message });
    req.flash('error', err.message);
    res.redirect('/signup');
  }
});

/**
 * GET /verify-email/:token - Verify email address
 */
router.get('/verify-email/:token', (req, res) => {
  const result = pendingApprovals.verifyEmailToken(req.params.token);

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect('/login');
  }

  // Email verified - notify admin that approval can proceed
  const adminEmails = authService.getAdminEmails();
  if (adminEmails.length > 0) {
    sendEmail({
      to: adminEmails.join(', '),
      subject: 'Account Ready for Approval - Roster Calendar',
      text: `A pilot has verified their email and is ready for approval:

Staff Number: ${result.staffNo}
Email: ${result.email}

You can approve this account at: ${req.protocol}://${req.get('host')}/admin/approvals`
    }).catch(err => {
      logger.error('[verify-email] Failed to send admin notification', { error: err.message });
    });
  }

  res.render('verify-email-success', { title: 'Email Verified' });
});

/**
 * GET /login - Show login form
 */
router.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

/**
 * POST /login - Handle login
 */
router.post('/login', [
  body('staffNo').matches(/^\d{6}$/).withMessage('Staff number must be exactly 6 digits'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/login');
  }

  const { staffNo, password } = req.body;

  try {
    // Verify credentials
    const valid = await authService.verifyCredentials(staffNo, password);
    if (!valid) {
      req.flash('error', 'Invalid staff number or password');
      return res.redirect('/login');
    }

    // Set session
    req.session.staffNo = staffNo;
    req.session.isAdmin = authService.isAdmin(staffNo);

    logger.info('[login] User logged in', { staffNo });

    // Redirect to returnTo or dashboard
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    logger.error('[login] Error', { error: err.message });
    req.flash('error', 'An error occurred during login');
    res.redirect('/login');
  }
});

/**
 * GET /logout - Handle logout
 */
router.get('/logout', (req, res) => {
  const staffNo = req.session.staffNo;
  req.session.destroy((err) => {
    if (err) {
      logger.error('[logout] Error destroying session', { error: err.message });
    } else {
      logger.info('[logout] User logged out', { staffNo });
    }
    res.redirect('/');
  });
});

/**
 * GET /forgot-password - Show forgot password form
 */
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Forgot Password' });
});

/**
 * POST /forgot-password - Handle forgot password
 */
router.post('/forgot-password', [
  body('staffNo').matches(/^\d{6}$/).withMessage('Staff number must be exactly 6 digits')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect('/forgot-password');
  }

  const { staffNo } = req.body;

  try {
    // Check if staff number exists
    if (!authService.hasCredentials(staffNo)) {
      // Don't reveal whether account exists
      req.flash('success', 'If an account exists for this staff number, a password reset link has been sent to the registered email.');
      return res.redirect('/login');
    }

    // Get email for staff number
    const email = pilotDirectory.getEmailForStaffNo(staffNo);
    if (!email) {
      // Don't reveal whether email exists
      req.flash('success', 'If an account exists for this staff number, a password reset link has been sent to the registered email.');
      return res.redirect('/login');
    }

    // Create reset request
    const result = passwordReset.createResetRequest(staffNo);

    // Send reset email
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${result.token}`;
    await sendEmail({
      to: email,
      subject: 'Password Reset - Roster Calendar',
      text: `You requested a password reset for your Roster Calendar account.

Click the link below to reset your password:

${resetUrl}

This link will expire in 24 hours.

If you didn't request this reset, please ignore this email. Your password will remain unchanged.`
    });

    logger.info('[forgot-password] Reset email sent', { staffNo });
    req.flash('success', 'If an account exists for this staff number, a password reset link has been sent to the registered email.');
    res.redirect('/login');
  } catch (err) {
    logger.error('[forgot-password] Error', { error: err.message });
    req.flash('success', 'If an account exists for this staff number, a password reset link has been sent to the registered email.');
    res.redirect('/login');
  }
});

/**
 * GET /reset-password/:token - Show reset password form
 */
router.get('/reset-password/:token', (req, res) => {
  const result = passwordReset.verifyResetToken(req.params.token);

  if (!result.valid) {
    req.flash('error', result.error || 'Invalid or expired reset token');
    return res.redirect('/forgot-password');
  }

  res.render('reset-password', { title: 'Reset Password', token: req.params.token });
});

/**
 * POST /reset-password - Handle password reset
 */
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array()[0].msg);
    return res.redirect(`/reset-password/${req.body.token}`);
  }

  const { token, password } = req.body;

  try {
    // Verify token
    const result = passwordReset.verifyResetToken(token);
    if (!result.valid) {
      req.flash('error', result.error || 'Invalid or expired reset token');
      return res.redirect('/forgot-password');
    }

    // Update password
    await authService.setPasswordForStaffNo(result.staffNo, password);

    // Consume token
    passwordReset.consumeResetToken(token);

    logger.info('[reset-password] Password reset successful', { staffNo: result.staffNo });
    req.flash('success', 'Password reset successful! You can now log in with your new password.');
    res.redirect('/login');
  } catch (err) {
    logger.error('[reset-password] Error', { error: err.message });
    req.flash('error', err.message);
    res.redirect(`/reset-password/${token}`);
  }
});

module.exports = router;

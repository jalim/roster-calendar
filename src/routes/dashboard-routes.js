/**
 * Dashboard route
 * Shows authenticated user's main dashboard
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/require-auth');

/**
 * GET /dashboard - Show user dashboard
 */
router.get('/dashboard', requireAuth, (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.render('dashboard', { 
    title: 'Dashboard',
    baseUrl
  });
});

module.exports = router;

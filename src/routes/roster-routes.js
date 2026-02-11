/**
 * Routes for roster upload and ICS generation
 */

const express = require('express');
const multer = require('multer');
const ICSCalendarService = require('../services/ics-calendar-service');
const rosterStore = require('../services/roster-store');
const { pollInboxOnce } = require('../services/inbox-roster-poller');
const pilotDirectory = require('../services/pilot-directory');
const { authenticateCalDAV } = require('../middleware/caldav-auth');
const authService = require('../services/auth-service');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function debugEnabled() {
  const v = String(process.env.ROSTER_DEBUG_ENDPOINTS || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

// Debug/troubleshooting endpoints (off by default)
// Enable with ROSTER_DEBUG_ENDPOINTS=true
router.get('/_debug/rosters', (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  return res.json({ rosterIds: rosterStore.listRosterIds() });
});

router.post('/_debug/email/poll', async (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  try {
    const result = await pollInboxOnce(process.env, console);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err && err.message ? err.message : 'Failed to poll inbox' });
  }
});

router.get('/_debug/pilot-emails', (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true, pilots: pilotDirectory.listPilotEmails(process.env) });
});

router.put('/_debug/pilot-emails/:staffNo', (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  try {
    const { staffNo } = req.params;
    const { email } = req.body || {};
    const saved = pilotDirectory.setEmailForStaffNo(staffNo, email, process.env);
    return res.json({ success: true, ...saved });
  } catch (err) {
    return res.status(400).json({ success: false, error: err && err.message ? err.message : 'Failed to set email' });
  }
});

router.delete('/_debug/pilot-emails/:staffNo', (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  try {
    const { staffNo } = req.params;
    const removed = pilotDirectory.deleteEmailForStaffNo(staffNo, process.env);
    return res.json({ success: true, removed });
  } catch (err) {
    return res.status(400).json({ success: false, error: err && err.message ? err.message : 'Failed to delete email' });
  }
});

/**
 * Set password for a staff number
 * POST /api/roster/password
 * Body: { staffNo: string, password: string }
 * 
 * Security: 
 * - Initial password creation (when no password exists) is allowed without authentication
 * - Password updates require authentication as the same staff number
 */
router.post('/password', async (req, res) => {
  try {
    const { staffNo, password } = req.body || {};
    
    if (!staffNo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Staff number is required' 
      });
    }
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password is required' 
      });
    }

    // Check if password already exists for this staff number
    const hasExistingPassword = authService.hasCredentials(staffNo, process.env);
    
    if (hasExistingPassword) {
      // Password exists - require authentication
      const auth = require('basic-auth');
      const credentials = auth(req);
      
      if (!credentials || !credentials.name || !credentials.pass) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Roster Calendar"');
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'You must authenticate with your current password to update it'
        });
      }
      
      // Verify current credentials
      const isValid = await authService.verifyCredentials(credentials.name, credentials.pass, process.env);
      
      if (!isValid) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Roster Calendar"');
        return res.status(401).json({ 
          error: 'Authentication failed',
          message: 'Invalid current password'
        });
      }
      
      // Verify user is updating their own password
      if (credentials.name !== staffNo) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You can only update your own password'
        });
      }
    }

    const result = await authService.setPasswordForStaffNo(staffNo, password, process.env);
    
    return res.json({
      success: true,
      staffNo: result.staffNo,
      message: result.created 
        ? 'Password created successfully' 
        : 'Password updated successfully'
    });
  } catch (err) {
    return res.status(400).json({ 
      success: false, 
      error: err && err.message ? err.message : 'Failed to set password' 
    });
  }
});

/**
 * Debug endpoint: List all staff numbers with credentials
 * GET /api/roster/_debug/credentials
 */
router.get('/_debug/credentials', (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  
  try {
    const staffNumbers = authService.listCredentialStaffNumbers(process.env);
    return res.json({ 
      success: true, 
      count: staffNumbers.length,
      staffNumbers 
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err && err.message ? err.message : 'Failed to list credentials' 
    });
  }
});

/**
 * Debug endpoint: Delete credentials for a staff number
 * DELETE /api/roster/_debug/credentials/:staffNo
 */
router.delete('/_debug/credentials/:staffNo', (req, res) => {
  if (!debugEnabled()) return res.status(404).json({ error: 'Not found' });
  
  try {
    const { staffNo } = req.params;
    const deleted = authService.deleteCredentials(staffNo, process.env);
    
    return res.json({ 
      success: true, 
      deleted,
      message: deleted ? 'Credentials deleted' : 'No credentials found for this staff number'
    });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err && err.message ? err.message : 'Failed to delete credentials' 
    });
  }
});

/**
 * Upload a roster file
 * POST /api/roster/upload
 */
router.post('/upload', upload.single('roster'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const rosterText = req.file.buffer.toString('utf-8');
    const { rosterId, roster } = rosterStore.ingestRosterText(rosterText);

    res.json({
      success: true,
      rosterId: rosterId,
      employee: roster.employee,
      entriesCount: roster.entries.length,
      icsUrl: `/api/roster/calendar.ics`
    });
  } catch (error) {
    console.error('Error processing roster:', error);
    res.status(500).json({ error: 'Failed to process roster file' });
  }
});

/**
 * Upload roster via text body
 * POST /api/roster/text
 */
router.post('/text', express.text({ type: 'text/plain', limit: '1mb' }), async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'No roster text provided' });
    }

    const { rosterId, roster } = rosterStore.ingestRosterText(req.body);

    res.json({
      success: true,
      rosterId: rosterId,
      employee: roster.employee,
      entriesCount: roster.entries.length,
      icsUrl: `/api/roster/calendar.ics`
    });
  } catch (error) {
    console.error('Error processing roster:', error);
    res.status(500).json({ error: 'Failed to process roster text' });
  }
});

/**
 * Get ICS calendar for authenticated user's roster
 * GET /api/roster/calendar.ics
 * Requires HTTP Basic Authentication - staff number from auth determines which roster to serve
 */
router.get('/calendar.ics', authenticateCalDAV, async (req, res) => {
  try {
    // Use authenticated staff number to determine which roster to serve
    const rosterId = req.authenticatedStaffNo;
    const rosterBucket = rosterStore.getRosterBucket(rosterId);

    if (!rosterBucket) {
      return res.status(404).json({ error: 'Roster not found' });
    }

    const icsService = new ICSCalendarService();
    
    // Look up pay rate for this pilot to include duty values
    const options = {};
    if (rosterBucket.employee && rosterBucket.employee.staffNo) {
      const payRate = pilotDirectory.getPayRateForStaffNo(rosterBucket.employee.staffNo, process.env);
      if (payRate !== null) {
        options.payRate = payRate;
      }
    }
    
    const icsData = await icsService.generateICSForRosters(rosterBucket.rosters, options);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${rosterId}.ics"`);
    res.send(icsData);
  } catch (error) {
    console.error('Error generating ICS:', error);
    res.status(500).json({ error: 'Failed to generate calendar' });
  }
});

/**
 * Get heavily redacted public ICS calendar for a staff member's roster
 * GET /api/roster/:staffNo/public/calendar.ics
 * No authentication required - shows only busy/free status without sensitive details
 * Useful for family/friends who only need to know availability
 */
router.get('/:staffNo/public/calendar.ics', async (req, res) => {
  try {
    const { staffNo } = req.params;
    const rosterBucket = rosterStore.getRosterBucket(staffNo);

    if (!rosterBucket) {
      return res.status(404).json({ error: 'Roster not found' });
    }

    const icsService = new ICSCalendarService();
    const icsData = await icsService.generatePublicICSForRosters(rosterBucket.rosters);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${staffNo}-public.ics"`);
    res.send(icsData);
  } catch (error) {
    console.error('Error generating public ICS:', error);
    res.status(500).json({ error: 'Failed to generate public calendar' });
  }
});


/**
 * Get roster information
 * GET /api/roster/:rosterId
 */
router.get('/:rosterId', (req, res) => {
  try {
    const { rosterId } = req.params;
    const rosterBucket = rosterStore.getRosterBucket(rosterId);

    if (!rosterBucket) {
      return res.status(404).json({ error: 'Roster not found' });
    }

    const combinedEntries = rosterBucket.rosters.flatMap(r => Array.isArray(r.entries) ? r.entries : []);

    res.json({
      rosterId,
      employee: rosterBucket.employee,
      rostersCount: rosterBucket.rosters.length,
      entriesCount: combinedEntries.length,
      entries: combinedEntries
    });
  } catch (error) {
    console.error('Error retrieving roster:', error);
    res.status(500).json({ error: 'Failed to retrieve roster' });
  }
});

module.exports = router;

/**
 * Routes for roster upload and ICS generation
 */

const express = require('express');
const multer = require('multer');
const QantasRosterParser = require('../parsers/qantas-roster-parser');
const ICSCalendarService = require('../services/ics-calendar-service');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// In-memory storage for rosters (in production, use a database)
const rosters = new Map();

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
    const parser = new QantasRosterParser();
    const roster = parser.parse(rosterText);

    // Generate a unique ID for this roster
    const rosterId = `${roster.employee.staffNo || Date.now()}`;
    
    // Store the roster
    rosters.set(rosterId, roster);

    res.json({
      success: true,
      rosterId: rosterId,
      employee: roster.employee,
      entriesCount: roster.entries.length,
      icsUrl: `/api/roster/${rosterId}/calendar.ics`
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

    const parser = new QantasRosterParser();
    const roster = parser.parse(req.body);

    // Generate a unique ID for this roster
    const rosterId = `${roster.employee.staffNo || Date.now()}`;
    
    // Store the roster
    rosters.set(rosterId, roster);

    res.json({
      success: true,
      rosterId: rosterId,
      employee: roster.employee,
      entriesCount: roster.entries.length,
      icsUrl: `/api/roster/${rosterId}/calendar.ics`
    });
  } catch (error) {
    console.error('Error processing roster:', error);
    res.status(500).json({ error: 'Failed to process roster text' });
  }
});

/**
 * Get ICS calendar for a roster
 * GET /api/roster/:rosterId/calendar.ics
 */
router.get('/:rosterId/calendar.ics', async (req, res) => {
  try {
    const { rosterId } = req.params;
    const roster = rosters.get(rosterId);

    if (!roster) {
      return res.status(404).json({ error: 'Roster not found' });
    }

    const icsService = new ICSCalendarService();
    const icsData = await icsService.generateICS(roster);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${rosterId}.ics"`);
    res.send(icsData);
  } catch (error) {
    console.error('Error generating ICS:', error);
    res.status(500).json({ error: 'Failed to generate calendar' });
  }
});

/**
 * Get roster information
 * GET /api/roster/:rosterId
 */
router.get('/:rosterId', (req, res) => {
  try {
    const { rosterId } = req.params;
    const roster = rosters.get(rosterId);

    if (!roster) {
      return res.status(404).json({ error: 'Roster not found' });
    }

    res.json({
      rosterId,
      employee: roster.employee,
      entriesCount: roster.entries.length,
      entries: roster.entries
    });
  } catch (error) {
    console.error('Error retrieving roster:', error);
    res.status(500).json({ error: 'Failed to retrieve roster' });
  }
});

module.exports = router;

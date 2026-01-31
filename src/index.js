/**
 * Main Express application for Roster Calendar Service
 */

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const rosterRoutes = require('./routes/roster-routes');
const { startInboxRosterPolling } = require('./services/inbox-roster-poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/roster', rosterRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'roster-calendar' });
});

// Welcome page
app.get('/', (req, res) => {
  res.json({
    service: 'Roster Calendar Service',
    version: '1.0.0',
    description: 'Convert pilot rosters to ICS calendar subscriptions',
    endpoints: {
      upload: 'POST /api/roster/upload - Upload roster file',
      uploadText: 'POST /api/roster/text - Upload roster as text',
      getCalendar: 'GET /api/roster/:rosterId/calendar.ics - Download ICS calendar',
      getRoster: 'GET /api/roster/:rosterId - Get roster details'
    }
  });
});

// Start server
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Roster Calendar Service running on port ${PORT}`);
  });

  const inboxPoller = startInboxRosterPolling(process.env, console);

  const shutdown = () => {
    try {
      if (inboxPoller && typeof inboxPoller.stop === 'function') inboxPoller.stop();
    } catch (_) {
      // ignore
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;

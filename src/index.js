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

  process.on('uncaughtException', err => {
    console.error('[fatal] uncaughtException', err);
    // Let the process exit; systemd will restart it if configured.
  });

  process.on('unhandledRejection', reason => {
    console.error('[fatal] unhandledRejection', reason);
    // Let the process exit; systemd will restart it if configured.
  });

  process.on('exit', code => {
    console.log(`[lifecycle] process exit code=${code}`);
  });

  const shutdown = signal => {
    console.log(`[lifecycle] received ${signal}; shutting down`);
    try {
      if (inboxPoller && typeof inboxPoller.stop === 'function') inboxPoller.stop();
    } catch (_) {
      // ignore
    }

    const forceExit = setTimeout(() => {
      console.warn('[lifecycle] force exiting after 10s');
      process.exit(0);
    }, 10_000);
    forceExit.unref();

    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

module.exports = app;

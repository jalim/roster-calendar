/**
 * Main Express application for Roster Calendar Service
 */

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const rosterRoutes = require('./routes/roster-routes');
const { startInboxRosterPolling } = require('./services/inbox-roster-poller');
const { createLogger, serializeError } = require('./services/logger');
const { maybeSendStartupEmail } = require('./services/startup-email-notifier');

const app = express();
const PORT = process.env.PORT || 3000;

const logger = createLogger({ component: 'roster-calendar' });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Optional access logging (off by default to keep journald noise down)
const httpLoggingEnabled = ['1', 'true', 'yes', 'y', 'on'].includes(
  String(process.env.ROSTER_HTTP_LOGGING || '').trim().toLowerCase()
);
if (httpLoggingEnabled) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.info('[http] request', {
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms
      });
    });
    next();
  });
}

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

// Last-resort Express error handler (prevents default HTML + ensures stack is logged)
app.use((err, req, res, next) => {
  logger.error('[http] unhandled error', {
    method: req && req.method,
    path: req && (req.originalUrl || req.url),
    error: serializeError(err)
  });

  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
if (require.main === module) {
  logger.info('[startup] boot', {
    node: process.version,
    pid: process.pid,
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    inboxPollingEnabled: String(process.env.ROSTER_EMAIL_POLLING_ENABLED || '').trim()
  });

  const server = app.listen(PORT, () => {
    logger.info('[startup] listening', { port: PORT });
  });

  server.on('error', err => {
    logger.error('[fatal] server error', { error: serializeError(err) });
    // Ensure systemd sees a failure and can restart depending on policy.
    process.exit(1);
  });

  let inboxPoller = null;
  try {
    inboxPoller = startInboxRosterPolling(process.env, logger.child({ component: 'inbox' }));
    if (inboxPoller && inboxPoller.config && inboxPoller.config.enabled) {
      logger.info('[startup] inbox polling enabled', {
        mailbox: inboxPoller.config.mailbox,
        intervalMs: inboxPoller.config.intervalMs,
        searchMode: inboxPoller.config.searchMode,
        processedMailbox: inboxPoller.config.processedMailbox || ''
      });
    }
  } catch (err) {
    // Treat inbox polling misconfiguration as non-fatal; keep the HTTP service alive.
    logger.error('[startup] inbox polling disabled due to error', { error: serializeError(err) });
    inboxPoller = { stop: () => {} };
  }

  // Health monitoring: email on each successful startup.
  // Non-fatal by design (don't take down the service if SMTP is down).
  Promise.resolve()
    .then(() => maybeSendStartupEmail(process.env, logger.child({ component: 'startup-email' }), {
      port: PORT,
      inboxConfig: inboxPoller && inboxPoller.config ? inboxPoller.config : undefined
    }))
    .then(result => {
      if (result && result.sent) {
        logger.info('[startup] startup email sent', { to: process.env.ROSTER_STARTUP_EMAIL_TO || 'admin@lumu.au' });
      } else if (result && result.reason && result.reason !== 'disabled') {
        logger.info('[startup] startup email not sent', { reason: result.reason });
      }
    })
    .catch(err => {
      logger.warn('[startup] startup email failed', { error: serializeError(err) });
    });

  const fatalExit = (kind, err) => {
    logger.error(`[fatal] ${kind}`, { error: serializeError(err) });
    // Give stdout/stderr a moment to flush to journald.
    setTimeout(() => process.exit(1), 250).unref();
  };

  process.on('uncaughtException', err => fatalExit('uncaughtException', err));
  process.on('unhandledRejection', reason => fatalExit('unhandledRejection', reason));

  process.on('warning', warning => {
    logger.warn('[process] warning', {
      name: warning && warning.name,
      message: warning && warning.message,
      stack: warning && warning.stack
    });
  });

  process.on('exit', code => {
    logger.info('[lifecycle] exit', { code });
  });

  const shutdown = signal => {
    logger.info('[lifecycle] shutdown', { signal });
    try {
      if (inboxPoller && typeof inboxPoller.stop === 'function') inboxPoller.stop();
    } catch (_) {
      // ignore
    }

    const forceExit = setTimeout(() => {
      logger.warn('[lifecycle] force exit after 10s');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

module.exports = app;

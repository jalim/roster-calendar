const os = require('os');
const { sendEmail } = require('./outbound-email-service');

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

function buildStartupEmail({ env, port, inboxConfig }) {
  const hostname = os.hostname();
  const when = new Date().toISOString();

  const subject = `[roster-calendar] started on ${hostname}`;

  const lines = [];
  lines.push('Roster Calendar Service startup');
  lines.push('');
  lines.push(`Time: ${when}`);
  lines.push(`Host: ${hostname}`);
  lines.push(`PID: ${process.pid}`);
  lines.push(`Node: ${process.version}`);
  lines.push(`Port: ${port}`);
  lines.push(`Env: ${env.NODE_ENV || 'development'}`);

  if (inboxConfig) {
    lines.push('');
    lines.push('Inbox polling:');
    lines.push(`- enabled: ${!!inboxConfig.enabled}`);
    lines.push(`- mailbox: ${inboxConfig.mailbox || ''}`);
    lines.push(`- intervalMs: ${inboxConfig.intervalMs || ''}`);
    lines.push(`- searchMode: ${inboxConfig.searchMode || ''}`);
    lines.push(`- processedMailbox: ${inboxConfig.processedMailbox || ''}`);
  }

  return { subject, text: lines.join('\n') };
}

async function maybeSendStartupEmail(
  env = process.env,
  logger = console,
  { port, inboxConfig } = {}
) {
  const outboundEnabled = parseBoolean(env.ROSTER_OUTBOUND_EMAIL_ENABLED, parseBoolean(env.ROSTER_NOTIFY_ENABLED, false));
  const enabled = parseBoolean(env.ROSTER_STARTUP_EMAIL_ENABLED, outboundEnabled);

  if (!enabled) {
    return { sent: false, reason: 'disabled' };
  }

  const to = env.ROSTER_STARTUP_EMAIL_TO || 'admin@lumu.au';
  const { subject, text } = buildStartupEmail({ env, port, inboxConfig });

  // Allow startup email to be enabled independently of other outbound email.
  // We force outbound email on for this one call so sendEmail() doesn't short-circuit.
  const envForSend = { ...env, ROSTER_OUTBOUND_EMAIL_ENABLED: 'true' };

  const result = await sendEmail({
    to,
    subject,
    text
  }, envForSend, logger);

  return result;
}

module.exports = {
  maybeSendStartupEmail,
  buildStartupEmail
};

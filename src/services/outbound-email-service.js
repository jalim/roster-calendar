const nodemailer = require('nodemailer');

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseBoolean(value, undefined);
}

function parseNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function getOutboundEmailConfig(env = process.env) {
  const port = parseNumber(env.ROSTER_SMTP_PORT, 587);

  // Nodemailer "secure" must match the port semantics:
  // - 465: implicit TLS (secure: true)
  // - 587/25: plaintext + optional STARTTLS (secure: false)
  // If the user explicitly sets ROSTER_SMTP_SECURE, respect it.
  const secureExplicit = parseOptionalBoolean(env.ROSTER_SMTP_SECURE);
  const secure = secureExplicit !== undefined ? secureExplicit : (port === 465);

  return {
    enabled: parseBoolean(env.ROSTER_OUTBOUND_EMAIL_ENABLED, parseBoolean(env.ROSTER_NOTIFY_ENABLED, false)),
    dryRun: parseBoolean(env.ROSTER_NOTIFY_DRY_RUN, false),
    host: env.ROSTER_SMTP_HOST,
    port,
    secure,
    user: env.ROSTER_SMTP_USER,
    pass: env.ROSTER_SMTP_PASS,
    from: env.ROSTER_EMAIL_FROM || env.ROSTER_SMTP_USER,

    // Optional knobs for slow/latent networks or strict TLS setups.
    connectionTimeoutMs: parseNumber(env.ROSTER_SMTP_CONNECTION_TIMEOUT_MS, 30_000),
    greetingTimeoutMs: parseNumber(env.ROSTER_SMTP_GREETING_TIMEOUT_MS, 30_000),
    socketTimeoutMs: parseNumber(env.ROSTER_SMTP_SOCKET_TIMEOUT_MS, 120_000),
    requireTLS: parseOptionalBoolean(env.ROSTER_SMTP_REQUIRE_TLS),
    tlsRejectUnauthorized: parseBoolean(env.ROSTER_SMTP_TLS_REJECT_UNAUTHORIZED, true)
  };
}

function validateConfig(config) {
  const missing = [];
  if (!config.host) missing.push('ROSTER_SMTP_HOST');
  if (!config.user) missing.push('ROSTER_SMTP_USER');
  if (!config.pass) missing.push('ROSTER_SMTP_PASS');
  if (!config.from) missing.push('ROSTER_EMAIL_FROM (or ROSTER_SMTP_USER)');

  if (missing.length > 0) {
    const err = new Error(`Outbound email misconfigured; missing: ${missing.join(', ')}`);
    err.code = 'OUTBOUND_EMAIL_CONFIG_MISSING';
    throw err;
  }
}

function createTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.greetingTimeoutMs,
    socketTimeout: config.socketTimeoutMs,
    requireTLS: config.requireTLS,
    tls: {
      rejectUnauthorized: config.tlsRejectUnauthorized
    },
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

async function sendEmail(message, env = process.env, logger = console) {
  const config = getOutboundEmailConfig(env);
  if (!config.enabled) {
    return { sent: false, reason: 'disabled' };
  }

  validateConfig(config);

  const payload = {
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    attachments: message.attachments || []
  };

  if (config.dryRun) {
    logger.log('[notify] dry-run outbound email', {
      to: payload.to,
      subject: payload.subject,
      attachments: (payload.attachments || []).map(a => a && a.filename).filter(Boolean)
    });
    return { sent: false, reason: 'dry-run' };
  }

  const transporter = createTransport(config);
  const info = await transporter.sendMail(payload);

  return {
    sent: true,
    messageId: info && info.messageId ? info.messageId : undefined
  };
}

module.exports = {
  sendEmail,
  getOutboundEmailConfig
};

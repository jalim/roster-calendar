const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const rosterStore = require('./roster-store');

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function normalizeAllowlist(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSearchMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'unseen';
  if (v === 'unseen') return 'unseen';
  if (v === 'all') return 'all';
  return 'unseen';
}

function addressFrom(parsed) {
  const from = parsed && parsed.from && parsed.from.value && parsed.from.value[0];
  const addr = from && from.address ? String(from.address).toLowerCase() : '';
  return addr;
}

function summarizeParsedEmail(parsed) {
  const subject = parsed && parsed.subject ? String(parsed.subject) : '';
  const from = addressFrom(parsed);
  const attachments = Array.isArray(parsed && parsed.attachments) ? parsed.attachments : [];
  const attachmentNames = attachments
    .map(a => (a && a.filename ? String(a.filename) : ''))
    .filter(Boolean);
  const hasTextBody = typeof (parsed && parsed.text) === 'string' && parsed.text.trim().length > 0;
  return { subject, from, attachmentNames, hasTextBody };
}

function chooseRosterTextFromParsedEmail(parsed) {
  if (!parsed) return null;

  const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
  for (const att of attachments) {
    const filename = att && att.filename ? String(att.filename) : '';
    if (!filename.match(/\.(txt|text)$/i)) continue;

    const content = att && att.content;
    if (!content) continue;

    // mailparser usually returns Buffer for attachment content
    if (Buffer.isBuffer(content)) return content.toString('utf8');
    if (content instanceof Uint8Array) return Buffer.from(content).toString('utf8');
    if (typeof content === 'string') return content;
    if (typeof content.toString === 'function') {
      const asString = content.toString('utf8');
      if (typeof asString === 'string') return asString;
    }
  }

  // Fallback: plain text body
  if (typeof parsed.text === 'string' && parsed.text.trim()) return parsed.text;
  return null;
}

function shouldProcessEmail(parsed, { fromAllowlist, subjectContains }) {
  if (!parsed) return false;

  if (Array.isArray(fromAllowlist) && fromAllowlist.length > 0) {
    const from = addressFrom(parsed);
    if (!from || !fromAllowlist.includes(from)) return false;
  }

  if (subjectContains) {
    const subj = parsed.subject ? String(parsed.subject) : '';
    if (!subj.toLowerCase().includes(String(subjectContains).toLowerCase())) return false;
  }

  return true;
}

async function processMessage({ client, uid, config }) {
  const download = await client.download(uid, undefined, { uid: true });
  const parsed = await simpleParser(download.content);
  const meta = summarizeParsedEmail(parsed);

  if (!shouldProcessEmail(parsed, config)) {
    return { processed: false, reason: 'filtered', ...meta };
  }

  const rosterText = chooseRosterTextFromParsedEmail(parsed);
  if (!rosterText) {
    return { processed: false, reason: 'no-roster-text', ...meta };
  }

  const { rosterId, roster, isNew } = rosterStore.ingestRosterText(rosterText);

  return {
    processed: true,
    ...meta,
    rosterId,
    employee: roster.employee,
    entriesCount: Array.isArray(roster.entries) ? roster.entries.length : 0,
    isNew
  };
}

async function pollOnce(config, logger = console) {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    doSTARTTLS: config.doSTARTTLS,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock(config.mailbox);

    const searchQuery = config.searchMode === 'all' ? { all: true } : { seen: false };
    const uids = await client.search(searchQuery);
    if (!uids || uids.length === 0) {
      return { checked: 0, processed: 0 };
    }

    let processed = 0;
    const results = [];
    for (const uid of uids) {
      try {
        const result = await processMessage({ client, uid, config });
        results.push({ uid, ...result });

        if (result.processed) {
          processed++;
          logger.log(
            `[inbox] processed uid=${uid} rosterId=${result.rosterId} entries=${result.entriesCount} new=${result.isNew}`
          );
        } else {
          logger.log(`[inbox] skipped uid=${uid} reason=${result.reason}`);
        }

        // Mark seen regardless, to avoid repeated failures looping.
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });

        // Optionally move processed mail
        if (config.processedMailbox && result.processed) {
          try {
            await client.messageMove(uid, config.processedMailbox, { uid: true });
          } catch (moveErr) {
            logger.warn(`[inbox] move failed uid=${uid}: ${moveErr && moveErr.message}`);
          }
        }
      } catch (msgErr) {
        logger.warn(`[inbox] error uid=${uid}: ${msgErr && msgErr.message}`);
        results.push({ uid, processed: false, reason: 'error', error: msgErr && msgErr.message ? msgErr.message : 'Unknown error' });
        try {
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        } catch (_) {
          // ignore
        }
      }
    }

    return { checked: uids.length, processed, results };
  } finally {
    try {
      if (lock) lock.release();
    } catch (_) {
      // ignore
    }
    try {
      await client.logout();
    } catch (_) {
      // ignore
    }
  }
}

async function pollInboxOnce(env = process.env, logger = console) {
  const config = loadInboxConfig(env);
  if (!config.enabled) {
    return { enabled: false, checked: 0, processed: 0 };
  }
  validateConfig(config);
  const result = await pollOnce(config, logger);
  return { enabled: true, ...result };
}

function loadInboxConfig(env = process.env) {
  const secure = parseBoolean(env.ROSTER_EMAIL_IMAP_SECURE, true);
  const port = parseNumber(env.ROSTER_EMAIL_IMAP_PORT, 993);

  // STARTTLS is commonly used on port 143. If the user specifies port 143 and
  // does not explicitly set STARTTLS behavior, require STARTTLS to match typical
  // "143 tls" expectations.
  const hasStarttlsSetting = !(env.ROSTER_EMAIL_IMAP_STARTTLS === undefined || env.ROSTER_EMAIL_IMAP_STARTTLS === null || env.ROSTER_EMAIL_IMAP_STARTTLS === '');
  const doSTARTTLS = hasStarttlsSetting
    ? parseBoolean(env.ROSTER_EMAIL_IMAP_STARTTLS, undefined)
    : (!secure && port === 143 ? true : undefined);

  return {
    enabled: parseBoolean(env.ROSTER_EMAIL_POLLING_ENABLED, false),
    host: env.ROSTER_EMAIL_IMAP_HOST,
    port,
    secure,
    doSTARTTLS,
    user: env.ROSTER_EMAIL_IMAP_USER,
    pass: env.ROSTER_EMAIL_IMAP_PASS,
    mailbox: env.ROSTER_EMAIL_IMAP_MAILBOX || 'INBOX',
    processedMailbox: env.ROSTER_EMAIL_PROCESSED_MAILBOX || '',
    intervalMs: parseNumber(env.ROSTER_EMAIL_POLL_INTERVAL_MS, 60_000),
    searchMode: normalizeSearchMode(env.ROSTER_EMAIL_IMAP_SEARCH),
    fromAllowlist: normalizeAllowlist(env.ROSTER_EMAIL_FROM_ALLOWLIST),
    subjectContains: env.ROSTER_EMAIL_SUBJECT_CONTAINS || ''
  };
}

function validateConfig(config) {
  const missing = [];
  if (!config.host) missing.push('ROSTER_EMAIL_IMAP_HOST');
  if (!config.user) missing.push('ROSTER_EMAIL_IMAP_USER');
  if (!config.pass) missing.push('ROSTER_EMAIL_IMAP_PASS');
  if (!config.mailbox) missing.push('ROSTER_EMAIL_IMAP_MAILBOX');
  if (missing.length > 0) {
    const err = new Error(`Inbox polling misconfigured; missing: ${missing.join(', ')}`);
    err.code = 'INBOX_CONFIG_MISSING';
    throw err;
  }

  if (config.secure === true && config.doSTARTTLS === true) {
    const err = new Error(
      'Inbox polling misconfigured; ROSTER_EMAIL_IMAP_SECURE=true is incompatible with ROSTER_EMAIL_IMAP_STARTTLS=true'
    );
    err.code = 'INBOX_CONFIG_INVALID';
    throw err;
  }

  if (config.searchMode === 'all' && !config.processedMailbox) {
    const err = new Error(
      'Inbox polling misconfigured; ROSTER_EMAIL_IMAP_SEARCH=all requires ROSTER_EMAIL_PROCESSED_MAILBOX to be set (prevents reprocessing)'
    );
    err.code = 'INBOX_CONFIG_INVALID';
    throw err;
  }
}

function startInboxRosterPolling(env = process.env, logger = console) {
  const config = loadInboxConfig(env);
  if (!config.enabled) {
    return { stop: () => {}, config };
  }

  validateConfig(config);

  let timer;
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (running) return;
    running = true;
    try {
      const result = await pollOnce(config, logger);
      logger.log(`[inbox] poll complete checked=${result.checked} processed=${result.processed}`);
    } catch (err) {
      logger.warn(`[inbox] poll error: ${err && err.message}`);
    } finally {
      running = false;
    }
  };

  // Initial tick quickly, then interval
  tick();
  timer = setInterval(tick, config.intervalMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    config,
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
    pollOnce: () => pollOnce(config, logger)
  };
}

module.exports = {
  startInboxRosterPolling,
  pollInboxOnce,
  loadInboxConfig,
  chooseRosterTextFromParsedEmail,
  shouldProcessEmail
};

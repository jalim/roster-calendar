function normalizeLevel(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'debug') return 'debug';
  if (v === 'info') return 'info';
  if (v === 'warn' || v === 'warning') return 'warn';
  if (v === 'error') return 'error';
  return 'info';
}

function levelToNumber(level) {
  switch (level) {
    case 'debug':
      return 10;
    case 'info':
      return 20;
    case 'warn':
      return 30;
    case 'error':
      return 40;
    default:
      return 20;
  }
}

function serializeError(err) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code
    };
  }

  if (typeof err === 'object') {
    const message = err.message ? String(err.message) : undefined;
    const stack = err.stack ? String(err.stack) : undefined;
    const code = err.code ? String(err.code) : undefined;
    return { message, stack, code };
  }

  return { message: String(err) };
}

function safeMeta(meta) {
  if (!meta || typeof meta !== 'object') return undefined;

  // Avoid logging secrets accidentally.
  const redactedKeys = new Set([
    'pass',
    'password',
    'token',
    'authorization',
    'cookie',
    'ROSTER_EMAIL_IMAP_PASS'
  ]);

  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (redactedKeys.has(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

function createLogger({ component, level } = {}) {
  const componentName = component ? String(component) : 'app';
  const minLevel = normalizeLevel(level || process.env.ROSTER_LOG_LEVEL);
  const minLevelNum = levelToNumber(minLevel);

  const emit = (lvl, msg, meta) => {
    if (levelToNumber(lvl) < minLevelNum) return;

    const payload = {
      ts: new Date().toISOString(),
      level: lvl,
      component: componentName,
      pid: process.pid,
      msg: msg === undefined ? '' : String(msg)
    };

    const m = safeMeta(meta);
    if (m && Object.keys(m).length > 0) payload.meta = m;

    const line = JSON.stringify(payload);

    if (lvl === 'error') {
      console.error(line);
    } else if (lvl === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (msg, meta) => emit('debug', msg, meta),
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),

    // Compatibility with existing code paths that pass `console`
    log: (msg, meta) => emit('info', msg, meta),

    child: (childMeta) => {
      const base = safeMeta(childMeta) || {};
      return {
        debug: (msg, meta) => emit('debug', msg, { ...base, ...(meta || {}) }),
        info: (msg, meta) => emit('info', msg, { ...base, ...(meta || {}) }),
        warn: (msg, meta) => emit('warn', msg, { ...base, ...(meta || {}) }),
        error: (msg, meta) => emit('error', msg, { ...base, ...(meta || {}) }),
        log: (msg, meta) => emit('info', msg, { ...base, ...(meta || {}) })
      };
    },

    serializeError
  };
}

module.exports = {
  createLogger,
  serializeError
};

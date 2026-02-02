const fs = require('fs');
const path = require('path');

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

function getPilotEmailConfig(env = process.env) {
  const storePath = env.ROSTER_PILOT_EMAIL_DB_PATH || path.join(process.cwd(), 'data', 'pilot-email-map.json');
  const allowWrites = !parseBoolean(env.ROSTER_PILOT_EMAIL_DB_READONLY, false);
  return { storePath, allowWrites };
}

function getPilotPayRateConfig(env = process.env) {
  const storePath = env.ROSTER_PILOT_PAY_RATE_DB_PATH || path.join(process.cwd(), 'data', 'pilot-pay-rate-map.json');
  const allowWrites = !parseBoolean(env.ROSTER_PILOT_PAY_RATE_DB_READONLY, false);
  return { storePath, allowWrites };
}

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeStaffNo(staffNo) {
  if (staffNo === undefined || staffNo === null) return '';
  return String(staffNo).trim();
}

function normalizeEmail(email) {
  if (email === undefined || email === null) return '';
  return String(email).trim().toLowerCase();
}

function looksLikeEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  // Simple, pragmatic check.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function readStore(env = process.env) {
  const { storePath } = getPilotEmailConfig(env);
  try {
    if (!fs.existsSync(storePath)) return {};
    const raw = fs.readFileSync(storePath, 'utf8');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    // Corrupt store should not crash.
    return {};
  }
}

let writeChain = Promise.resolve();

function writeStore(data, env = process.env) {
  const { storePath, allowWrites } = getPilotEmailConfig(env);
  if (!allowWrites) {
    const err = new Error('Pilot email DB is read-only');
    err.code = 'PILOT_EMAIL_DB_READONLY';
    throw err;
  }

  writeChain = writeChain
    .then(() => {
      ensureDirExists(storePath);
      const tmpPath = `${storePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
      fs.renameSync(tmpPath, storePath);
    })
    .catch(() => {
      // Ignore write errors to keep core service running.
    });

  return writeChain;
}

function getEmailForStaffNo(staffNo, env = process.env) {
  const key = normalizeStaffNo(staffNo);
  if (!key) return null;
  const store = readStore(env);
  const email = store[key];
  return email ? normalizeEmail(email) : null;
}

function setEmailForStaffNo(staffNo, email, env = process.env) {
  const key = normalizeStaffNo(staffNo);
  if (!key) {
    const err = new Error('staffNo is required');
    err.code = 'PILOT_EMAIL_INVALID_STAFFNO';
    throw err;
  }

  if (!looksLikeEmail(email)) {
    const err = new Error('email is invalid');
    err.code = 'PILOT_EMAIL_INVALID_EMAIL';
    throw err;
  }

  const store = readStore(env);
  store[key] = normalizeEmail(email);
  writeStore(store, env);
  return { staffNo: key, email: store[key] };
}

function deleteEmailForStaffNo(staffNo, env = process.env) {
  const key = normalizeStaffNo(staffNo);
  if (!key) return false;

  const store = readStore(env);
  if (!Object.prototype.hasOwnProperty.call(store, key)) return false;

  delete store[key];
  writeStore(store, env);
  return true;
}

function listPilotEmails(env = process.env) {
  const store = readStore(env);
  return Object.entries(store)
    .map(([staffNo, email]) => ({ staffNo, email: normalizeEmail(email) }))
    .sort((a, b) => a.staffNo.localeCompare(b.staffNo));
}

function flushWrites() {
  return writeChain;
}

// ========== Pay Rate Management ==========

function readPayRateStore(env = process.env) {
  const { storePath } = getPilotPayRateConfig(env);
  try {
    if (!fs.existsSync(storePath)) return {};
    const raw = fs.readFileSync(storePath, 'utf8');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    // Corrupt store should not crash.
    return {};
  }
}

function writePayRateStore(data, env = process.env) {
  const { storePath, allowWrites } = getPilotPayRateConfig(env);
  if (!allowWrites) {
    const err = new Error('Pilot pay rate DB is read-only');
    err.code = 'PILOT_PAY_RATE_DB_READONLY';
    throw err;
  }

  writeChain = writeChain
    .then(() => {
      ensureDirExists(storePath);
      const tmpPath = `${storePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
      fs.renameSync(tmpPath, storePath);
    })
    .catch(() => {
      // Ignore write errors to keep core service running.
    });

  return writeChain;
}

function getPayRateForStaffNo(staffNo, env = process.env) {
  const key = normalizeStaffNo(staffNo);
  if (!key) return null;
  const store = readPayRateStore(env);
  const payRate = store[key];
  return payRate !== undefined && payRate !== null ? Number(payRate) : null;
}

function setPayRateForStaffNo(staffNo, payRate, env = process.env) {
  const key = normalizeStaffNo(staffNo);
  if (!key) {
    const err = new Error('staffNo is required');
    err.code = 'PILOT_PAY_RATE_INVALID_STAFFNO';
    throw err;
  }

  const rate = Number(payRate);
  if (!Number.isFinite(rate) || rate < 0) {
    const err = new Error('payRate must be a non-negative number');
    err.code = 'PILOT_PAY_RATE_INVALID_RATE';
    throw err;
  }

  const store = readPayRateStore(env);
  store[key] = rate;
  writePayRateStore(store, env);
  return { staffNo: key, payRate: rate };
}

function deletePayRateForStaffNo(staffNo, env = process.env) {
  const key = normalizeStaffNo(staffNo);
  if (!key) return false;

  const store = readPayRateStore(env);
  if (!Object.prototype.hasOwnProperty.call(store, key)) return false;

  delete store[key];
  writePayRateStore(store, env);
  return true;
}

function listPilotPayRates(env = process.env) {
  const store = readPayRateStore(env);
  return Object.entries(store)
    .map(([staffNo, payRate]) => ({ staffNo, payRate: Number(payRate) }))
    .sort((a, b) => a.staffNo.localeCompare(b.staffNo));
}

module.exports = {
  getEmailForStaffNo,
  setEmailForStaffNo,
  deleteEmailForStaffNo,
  listPilotEmails,
  getPayRateForStaffNo,
  setPayRateForStaffNo,
  deletePayRateForStaffNo,
  listPilotPayRates,
  // for tests
  _getPilotEmailConfig: getPilotEmailConfig,
  _getPilotPayRateConfig: getPilotPayRateConfig,
  _readStore: readStore,
  _writeStore: writeStore,
  _readPayRateStore: readPayRateStore,
  _writePayRateStore: writePayRateStore,
  _flushWrites: flushWrites,
  _looksLikeEmail: looksLikeEmail
};

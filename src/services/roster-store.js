const crypto = require('crypto');
const QantasRosterParser = require('../parsers/qantas-roster-parser');
const fs = require('fs');
const path = require('path');

// In-memory storage for rosters (in production, use a database)
// Map<rosterId, { employee: Object, rosters: Array<Object>, rosterHashes: Set<string> }>
const rosters = new Map();

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

function getPersistenceConfig(env = process.env) {
  const enabled = parseBoolean(env.ROSTER_PERSIST_ENABLED, false) || !!env.ROSTER_PERSIST_PATH;
  const storePath = env.ROSTER_PERSIST_PATH || path.join(process.cwd(), 'data', 'roster-store.json');
  return { enabled, storePath };
}

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function serializeStore() {
  const data = {};
  for (const [rosterId, bucket] of rosters.entries()) {
    data[rosterId] = {
      employee: bucket.employee || {},
      rosters: Array.isArray(bucket.rosters) ? bucket.rosters : [],
      rosterHashes: Array.from(bucket.rosterHashes || [])
    };
  }
  return data;
}

function hydrateStore(serialized) {
  rosters.clear();
  if (!serialized || typeof serialized !== 'object') return;

  for (const [rosterId, bucket] of Object.entries(serialized)) {
    if (!bucket || typeof bucket !== 'object') continue;
    rosters.set(rosterId, {
      employee: bucket.employee || {},
      rosters: Array.isArray(bucket.rosters) ? bucket.rosters : [],
      rosterHashes: new Set(Array.isArray(bucket.rosterHashes) ? bucket.rosterHashes : [])
    });
  }
}

let persistenceInitialized = false;
let persistWriteChain = Promise.resolve();
let persistenceErrorLogged = false;

function initPersistence(env = process.env) {
  if (persistenceInitialized) return;
  persistenceInitialized = true;

  const { enabled, storePath } = getPersistenceConfig(env);
  if (!enabled) return;

  try {
    if (!fs.existsSync(storePath)) return;
    const raw = fs.readFileSync(storePath, 'utf8');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    hydrateStore(parsed);
  } catch (err) {
    if (!persistenceErrorLogged) {
      persistenceErrorLogged = true;
      console.warn(
        `[persist] failed to read/parse store at ${storePath}: ${err && err.message ? err.message : String(err)}`
      );
    }
    // Corrupt or unreadable store should not crash the service.
    // Start with an empty store.
    rosters.clear();
  }
}

function persistNow(env = process.env) {
  const { enabled, storePath } = getPersistenceConfig(env);
  if (!enabled) return;

  // Serialize writes to avoid overlapping file writes.
  persistWriteChain = persistWriteChain
    .then(() => {
      ensureDirExists(storePath);
      const tmpPath = `${storePath}.tmp`;
      const json = JSON.stringify(serializeStore());
      fs.writeFileSync(tmpPath, json, 'utf8');
      fs.renameSync(tmpPath, storePath);
    })
    .catch(err => {
      if (!persistenceErrorLogged) {
        persistenceErrorLogged = true;
        console.warn(
          `[persist] failed to write store at ${storePath}: ${err && err.message ? err.message : String(err)}`
        );
      }
      // Ignore persistence errors; keep in-memory behavior.
    });

  return persistWriteChain;
}

function flushPersistence() {
  return persistWriteChain;
}

// Initialize once on first import (safe: persistence disabled unless enabled via env)
initPersistence(process.env);

function getRosterId(roster) {
  if (roster && roster.employee && roster.employee.staffNo) {
    return String(roster.employee.staffNo).trim();
  }
  // No staff number in file; treat as unique "anonymous" roster stream.
  return `anonymous-${Date.now()}`;
}

function getRosterHash(rosterText) {
  return crypto.createHash('sha256').update(String(rosterText || ''), 'utf8').digest('hex');
}

/**
 * Ingest raw roster text, parse it, and store it (deduplicated by roster text hash).
 * @param {string} rosterText
 * @returns {{ rosterId: string, roster: Object, isNew: boolean }}
 */
function ingestRosterText(rosterText) {
  const parser = new QantasRosterParser();
  const roster = parser.parse(rosterText);

  const rosterId = getRosterId(roster);
  const rosterHash = getRosterHash(rosterText);

  const existing = rosters.get(rosterId);
  if (!existing) {
    rosters.set(rosterId, {
      employee: roster.employee,
      rosters: [roster],
      rosterHashes: new Set([rosterHash])
    });
    persistNow(process.env);
    return { rosterId, roster, isNew: true };
  }

  if (existing.rosterHashes.has(rosterHash)) {
    return { rosterId, roster, isNew: false };
  }

  existing.employee = roster.employee || existing.employee;
  existing.rosters.push(roster);
  existing.rosterHashes.add(rosterHash);
  persistNow(process.env);
  return { rosterId, roster, isNew: true };
}

function getRosterBucket(rosterId) {
  return rosters.get(rosterId);
}

function hasRoster(rosterId) {
  return rosters.has(rosterId);
}

function listRosterIds() {
  return Array.from(rosters.keys());
}

module.exports = {
  ingestRosterText,
  getRosterBucket,
  hasRoster,
  listRosterIds,
  // For tests/debugging
  _initPersistence: initPersistence,
  _persistNow: persistNow,
  _flushPersistence: flushPersistence,
  _hydrateStore: hydrateStore,
  _serializeStore: serializeStore
};

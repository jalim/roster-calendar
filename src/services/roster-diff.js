function normalizeStaffNo(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeDateKey(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function formatEntry(entry) {
  if (!entry || typeof entry !== 'object') return '';

  const dutyCode = entry.dutyCode ? String(entry.dutyCode).trim() : '';
  const dutyType = entry.dutyType ? String(entry.dutyType).trim() : '';

  if (dutyType === 'DAY_OFF') return 'D/O';

  const parts = [];
  if (dutyCode) parts.push(dutyCode);

  if (entry.service) parts.push(String(entry.service).trim());

  if (entry.signOn && entry.signOff) {
    parts.push(`${String(entry.signOn).trim()}-${String(entry.signOff).trim()}`);
  }

  if (entry.port) parts.push(String(entry.port).trim());

  // Some non-flight rows include a trailing code (e.g. AW01)
  if (entry.code && dutyType !== 'FLIGHT') {
    parts.push(String(entry.code).trim());
  }

  return parts.join(' ');
}

function buildDayMap(roster) {
  const map = new Map();
  const entries = roster && Array.isArray(roster.entries) ? roster.entries : [];

  for (const entry of entries) {
    const dateKey = normalizeDateKey(entry && entry.date ? entry.date : `${entry.day || ''} ${entry.dayOfWeek || ''}`);
    if (!dateKey) continue;

    const existing = map.get(dateKey);
    const formatted = formatEntry(entry);

    if (!existing) {
      map.set(dateKey, formatted);
      continue;
    }

    // If multiple entries share a date, preserve them in a stable order.
    const joined = [existing, formatted].filter(Boolean).join(' | ');
    map.set(dateKey, joined);
  }

  return map;
}

function sortDateKeys(dateKeys) {
  // Roster date keys are like "10 Tue"; sort numerically by day first.
  // If parsing fails, fall back to lexicographic.
  return [...dateKeys].sort((a, b) => {
    const aDay = parseInt(String(a).trim().split(/\s+/)[0], 10);
    const bDay = parseInt(String(b).trim().split(/\s+/)[0], 10);
    const aOk = Number.isFinite(aDay);
    const bOk = Number.isFinite(bDay);

    if (aOk && bOk && aDay !== bDay) return aDay - bDay;
    return String(a).localeCompare(String(b));
  });
}

function diffRosters(previousRoster, currentRoster) {
  if (!currentRoster || typeof currentRoster !== 'object') {
    throw new Error('diffRosters requires currentRoster');
  }

  const prevMap = buildDayMap(previousRoster);
  const currMap = buildDayMap(currentRoster);

  const allKeys = new Set([...prevMap.keys(), ...currMap.keys()]);
  const sortedKeys = sortDateKeys(allKeys);

  const added = [];
  const removed = [];
  const changed = [];

  for (const dateKey of sortedKeys) {
    const prev = prevMap.get(dateKey);
    const curr = currMap.get(dateKey);

    if (prev === undefined && curr !== undefined) {
      added.push({ date: dateKey, now: curr });
      continue;
    }

    if (prev !== undefined && curr === undefined) {
      removed.push({ date: dateKey, was: prev });
      continue;
    }

    if (prev !== curr) {
      changed.push({ date: dateKey, was: prev || '', now: curr || '' });
    }
  }

  const employee = currentRoster.employee || {};
  const staffNo = normalizeStaffNo(employee.staffNo);

  return {
    staffNo,
    added,
    removed,
    changed,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0
  };
}

function formatDiffAsText(diff, { maxLines = 50 } = {}) {
  if (!diff) return 'No diff available.';

  const lines = [];

  const pushSection = (title, items, formatter) => {
    if (!items || items.length === 0) return;
    lines.push(title);
    for (const item of items) {
      lines.push(formatter(item));
      if (lines.length >= maxLines) return;
    }
  };

  pushSection('Changed:', diff.changed, (c) => `- ${c.date}: ${c.was} -> ${c.now}`);
  if (lines.length < maxLines) {
    pushSection('Added:', diff.added, (a) => `- ${a.date}: ${a.now}`);
  }
  if (lines.length < maxLines) {
    pushSection('Removed:', diff.removed, (r) => `- ${r.date}: ${r.was}`);
  }

  if (lines.length === 0) return 'No duty changes detected.';

  if (lines.length >= maxLines) {
    lines.push('… (truncated)');
  }

  return lines.join('\n');
}

module.exports = {
  diffRosters,
  formatDiffAsText
};

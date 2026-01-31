/**
 * Tests for Timezone Service
 */

const TimezoneService = require('../src/services/timezone-service');
const fs = require('fs');
const path = require('path');

describe('TimezoneService', () => {
  let timezoneService;

  beforeAll(() => {
    timezoneService = new TimezoneService();
  });

  test('should return correct timezone for Perth', () => {
    const timezone = timezoneService.getTimezone('PER');
    expect(timezone).toBe('Australia/Perth');
  });

  test('should return correct timezone for Sydney', () => {
    const timezone = timezoneService.getTimezone('SYD');
    expect(timezone).toBe('Australia/Sydney');
  });

  test('should return correct timezone for Melbourne', () => {
    const timezone = timezoneService.getTimezone('MEL');
    expect(timezone).toBe('Australia/Melbourne');
  });

  test('should return correct timezone for Brisbane', () => {
    const timezone = timezoneService.getTimezone('BNE');
    expect(timezone).toBe('Australia/Brisbane');
  });

  test('should return correct timezone for Solomon (SLJ)', () => {
    const timezone = timezoneService.getTimezone('SLJ');
    expect(timezone).toBe('Australia/Perth');
  });

  test('should return correct timezone for Newman (ZNE)', () => {
    const timezone = timezoneService.getTimezone('ZNE');
    expect(timezone).toBe('Australia/Perth');
  });

  test('should return correct timezone for international airports', () => {
    expect(timezoneService.getTimezone('LAX')).toBe('America/Los_Angeles');
    expect(timezoneService.getTimezone('SIN')).toBe('Asia/Singapore');
    expect(timezoneService.getTimezone('HND')).toBe('Asia/Tokyo');
    expect(timezoneService.getTimezone('LHR')).toBe('Europe/London');
  });

  test('should return default timezone for unknown airport', () => {
    const timezone = timezoneService.getTimezone('XXX');
    expect(timezone).toBe('Australia/Sydney');
  });

  test('should return default timezone for null/undefined', () => {
    expect(timezoneService.getTimezone(null)).toBe('Australia/Sydney');
    expect(timezoneService.getTimezone(undefined)).toBe('Australia/Sydney');
  });

  test('should handle lowercase airport codes', () => {
    const timezone = timezoneService.getTimezone('per');
    expect(timezone).toBe('Australia/Perth');
  });

  test('should identify Australian airports', () => {
    expect(timezoneService.isAustralianAirport('PER')).toBe(true);
    expect(timezoneService.isAustralianAirport('SYD')).toBe(true);
    expect(timezoneService.isAustralianAirport('LAX')).toBe(false);
    expect(timezoneService.isAustralianAirport('SIN')).toBe(false);
  });

  test('should load all airport timezones from CSV', () => {
    const csvPath = path.join(__dirname, '..', 'src', 'data', 'qantas_airports_timezones.csv');
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const splitCsvLine = (line) => {
      const fields = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (ch === ',' && !inQuotes) {
          fields.push(current);
          current = '';
          continue;
        }

        current += ch;
      }

      fields.push(current);
      return fields;
    };

    const headers = splitCsvLine(lines[0]).map(h => String(h).trim());
    const codeIdx = headers.findIndex(h => h.toLowerCase().includes('iata'));
    const tzIdx = headers.findIndex(h => h.toLowerCase().includes('time zone') || h.toLowerCase().includes('iana'));
    expect(codeIdx).toBeGreaterThanOrEqual(0);
    expect(tzIdx).toBeGreaterThanOrEqual(0);

    const mapping = {};
    for (const line of lines.slice(1)) {
      const fields = splitCsvLine(line);
      const code = fields[codeIdx] ? String(fields[codeIdx]).trim().toUpperCase() : '';
      const tz = fields[tzIdx] ? String(fields[tzIdx]).trim() : '';
      if (!code || !/^[A-Z0-9]{3}$/.test(code) || !tz) continue;
      mapping[code] = tz;
    }

    const codes = Object.keys(mapping);
    expect(codes.length).toBeGreaterThan(0);

    for (const code of codes) {
      expect(timezoneService.getTimezone(code)).toBe(mapping[code]);
    }
  });
});

/**
 * Timezone mapping service for Australian and international airports
 * Maps IATA airport codes to their respective timezones
 */

const fs = require('fs');
const path = require('path');

class TimezoneService {
  constructor() {
    const defaultAirportTimezones = {
      // Australian airports (fallbacks; most are sourced from CSV)
      'PER': 'Australia/Perth',
      'SLJ': 'Australia/Perth',
      'SYD': 'Australia/Sydney',
      'MEL': 'Australia/Melbourne',
      'BNE': 'Australia/Brisbane',
      'ADL': 'Australia/Adelaide',
      'CNS': 'Australia/Brisbane',
      'DRW': 'Australia/Darwin',
      'HBA': 'Australia/Hobart',
      'OOL': 'Australia/Brisbane',
      'CBR': 'Australia/Sydney',
      'ASP': 'Australia/Darwin',
      'ZNE': 'Australia/Perth',

      // International airports (fallbacks for ports not present in CSV)
      'NRT': 'Asia/Tokyo',
      'DXB': 'Asia/Dubai',
      'DOH': 'Asia/Qatar',
      'BOM': 'Asia/Kolkata',
      'CGK': 'Asia/Jakarta',
      'PEK': 'Asia/Shanghai',
      'PVG': 'Asia/Shanghai',
      'ICN': 'Asia/Seoul',
      'TPE': 'Asia/Taipei'
    };

    const csvAirportTimezones = this.loadAirportTimezonesFromCsv();
    this.airportTimezones = { ...defaultAirportTimezones, ...csvAirportTimezones };
  }

  splitCsvLine(line) {
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
  }

  loadAirportTimezonesFromCsv() {
    const csvPath = path.join(__dirname, '..', 'data', 'qantas_airports_timezones.csv');

    let raw;
    try {
      raw = fs.readFileSync(csvPath, 'utf8');
    } catch {
      return {};
    }

    const lines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length < 2) return {};

    const headers = this.splitCsvLine(lines[0]).map(h => String(h).trim());
    const codeIdx = headers.findIndex(h => h.toLowerCase().includes('iata'));
    const tzIdx = headers.findIndex(h => h.toLowerCase().includes('time zone') || h.toLowerCase().includes('iana'));
    if (codeIdx < 0 || tzIdx < 0) return {};

    const mapping = {};
    for (const line of lines.slice(1)) {
      const fields = this.splitCsvLine(line);
      const code = fields[codeIdx] ? String(fields[codeIdx]).trim().toUpperCase() : '';
      const tz = fields[tzIdx] ? String(fields[tzIdx]).trim() : '';

      if (!code || !/^[A-Z0-9]{3}$/.test(code)) continue;
      if (!tz) continue;

      mapping[code] = tz;
    }

    return mapping;
  }

  /**
   * Get IANA timezone for an airport code
   * @param {string} airportCode - IATA airport code (e.g., 'PER', 'SYD')
   * @returns {string} IANA timezone identifier or default
   */
  getTimezone(airportCode) {
    if (!airportCode) {
      return 'Australia/Sydney'; // Default to Sydney time
    }
    
    const code = airportCode.toUpperCase().trim();
    return this.airportTimezones[code] || 'Australia/Sydney';
  }

  /**
   * Check if an airport is in Australia
   * @param {string} airportCode - IATA airport code
   * @returns {boolean} True if airport is in Australia
   */
  isAustralianAirport(airportCode) {
    if (!airportCode) return true;
    const timezone = this.getTimezone(airportCode);
    return timezone.startsWith('Australia/');
  }

  /**
   * Get UTC offset for a timezone at a specific date
   * This requires a library like moment-timezone or date-fns-tz
   * For now, returns the timezone identifier
   * @param {string} timezone - IANA timezone identifier
   * @param {Date} date - Date to check offset for
   * @returns {string} Timezone identifier
   */
  getTimezoneForDate(timezone, date) {
    // In a full implementation with moment-timezone or luxon:
    // return moment.tz(date, timezone).format('Z');
    // For now, just return the timezone identifier
    return timezone;
  }
}

module.exports = TimezoneService;

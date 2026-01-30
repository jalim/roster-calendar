/**
 * Timezone mapping service for Australian and international airports
 * Maps IATA airport codes to their respective timezones
 */

class TimezoneService {
  constructor() {
    // Map of IATA airport codes to IANA timezone identifiers
    this.airportTimezones = {
      // Australian airports
      'PER': 'Australia/Perth',          // Perth - UTC+8 (no DST)
      'SYD': 'Australia/Sydney',         // Sydney - UTC+10/11 (DST)
      'MEL': 'Australia/Melbourne',      // Melbourne - UTC+10/11 (DST)
      'BNE': 'Australia/Brisbane',       // Brisbane - UTC+10 (no DST)
      'ADL': 'Australia/Adelaide',       // Adelaide - UTC+9:30/10:30 (DST)
      'CNS': 'Australia/Brisbane',       // Cairns - UTC+10 (no DST)
      'DRW': 'Australia/Darwin',         // Darwin - UTC+9:30 (no DST)
      'HBA': 'Australia/Hobart',         // Hobart - UTC+10/11 (DST)
      'OOL': 'Australia/Brisbane',       // Gold Coast - UTC+10 (no DST)
      'CBR': 'Australia/Sydney',         // Canberra - UTC+10/11 (DST)
      'ASP': 'Australia/Darwin',         // Alice Springs - UTC+9:30 (no DST)
      'ZNE': 'Australia/Brisbane',       // Newman - UTC+8 (assumed, should verify)
      
      // International airports (common Qantas destinations)
      'LAX': 'America/Los_Angeles',      // Los Angeles
      'SFO': 'America/Los_Angeles',      // San Francisco
      'JFK': 'America/New_York',         // New York
      'LHR': 'Europe/London',            // London
      'SIN': 'Asia/Singapore',           // Singapore
      'HKG': 'Asia/Hong_Kong',           // Hong Kong
      'BKK': 'Asia/Bangkok',             // Bangkok
      'NRT': 'Asia/Tokyo',               // Tokyo Narita
      'HND': 'Asia/Tokyo',               // Tokyo Haneda
      'AKL': 'Pacific/Auckland',         // Auckland
      'CHC': 'Pacific/Auckland',         // Christchurch
      'DXB': 'Asia/Dubai',               // Dubai
      'DOH': 'Asia/Qatar',               // Doha
      'SCL': 'America/Santiago',         // Santiago
      'JNB': 'Africa/Johannesburg',      // Johannesburg
      'BOM': 'Asia/Kolkata',             // Mumbai
      'DEL': 'Asia/Kolkata',             // Delhi
      'CGK': 'Asia/Jakarta',             // Jakarta
      'MNL': 'Asia/Manila',              // Manila
      'PEK': 'Asia/Shanghai',            // Beijing
      'PVG': 'Asia/Shanghai',            // Shanghai
      'ICN': 'Asia/Seoul',               // Seoul
      'TPE': 'Asia/Taipei',              // Taipei
      'HNL': 'Pacific/Honolulu',         // Honolulu
      'YVR': 'America/Vancouver',        // Vancouver
    };
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

/**
 * Parser for Qantas roster text files
 * Handles the Qantas Airways Limited roster format
 */

class QantasRosterParser {
  compareYMD(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  }

  inferPeriodStartFromDatedLegs(roster) {
    const candidates = [];

    const flights = roster && Array.isArray(roster.flights) ? roster.flights : [];
    for (const f of flights) {
      if (!f) continue;
      if (!Number.isFinite(f.year) || !Number.isFinite(f.month) || !Number.isFinite(f.day)) continue;
      candidates.push({ year: f.year, month: f.month, day: f.day });
    }

    const patterns = roster && Array.isArray(roster.dutyPatterns) ? roster.dutyPatterns : [];
    for (const p of patterns) {
      const legs = p && Array.isArray(p.legs) ? p.legs : [];
      for (const leg of legs) {
        if (!leg) continue;
        if (!Number.isFinite(leg.year) || !Number.isFinite(leg.month) || !Number.isFinite(leg.day)) continue;
        candidates.push({ year: leg.year, month: leg.month, day: leg.day });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => this.compareYMD(a, b));
    const anchor = candidates[0];

    const entries = roster && Array.isArray(roster.entries) ? roster.entries : [];
    const firstEntry = entries.length > 0 ? entries[0] : null;
    const firstEntryDay = firstEntry && Number.isFinite(firstEntry.day) ? firstEntry.day : null;

    // Heuristic: if the first roster-table day-of-month is greater than the earliest dated leg day,
    // the roster likely starts in the previous month (e.g. starts 28Jan, earliest flight is 02Feb).
    let startMonth = anchor.month;
    let startYear = anchor.year;
    if (Number.isFinite(firstEntryDay) && firstEntryDay > anchor.day) {
      startMonth = (startMonth + 11) % 12;
      if (startMonth === 11) startYear -= 1;
    }

    return { month: startMonth, year: startYear };
  }

  normalizeFlightNumber(flightNumber) {
    if (flightNumber === null || flightNumber === undefined) return flightNumber;

    const value = String(flightNumber).trim().toUpperCase();
    if (!value) return value;

    // Idempotent normalization.
    if (/^QF\d+$/.test(value)) return value;

    // Qantas rosters use numeric flight numbers; normalize them.
    if (/^\d+$/.test(value)) return `QF${value}`;

    return value;
  }

  normalizeService(service) {
    if (service === null || service === undefined) return service;

    const raw = String(service).trim().toUpperCase();
    if (!raw) return raw;

    // Roster table sometimes prefixes passive flights with 'P' (e.g. P937).
    const withoutPassivePrefix = raw.startsWith('P') ? raw.slice(1) : raw;

    // Some entries can include multiple flight numbers (e.g. 123/456).
    const segments = withoutPassivePrefix.split('/').filter(Boolean);
    const normalizedSegments = segments.map(s => this.normalizeFlightNumber(s));
    return normalizedSegments.join('/');
  }

  /**
   * Parse a Qantas roster text file
   * @param {string} rosterText - The raw roster text content
   * @returns {Object} Parsed roster data
   */
  parse(rosterText) {
    const lines = rosterText.split('\n');
    
    const roster = {
      employee: {},
      entries: [],
      flights: [],
      dutyPatterns: [],
      summary: {}
    };

    // Parse header information
    this.parseHeader(lines, roster);
    
    // Parse roster entries
    this.parseRosterEntries(lines, roster);

    // Parse summary / metadata that appears after the main table
    this.parseSummary(lines, roster);

    // Parse Pattern Details section into individual flight legs
    this.parsePatternDetails(lines, roster);

    return roster;
  }

  parseRosterDateToken(dateToken) {
    if (!dateToken) return null;

    const match = String(dateToken).trim().match(/^(\d{1,2})([A-Za-z]{3})(\d{2})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const mon = match[2];
    const yy = parseInt(match[3], 10);

    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };

    const month = monthMap[mon];
    if (month === undefined) return null;

    // Map 2-digit years into a reasonable range for rosters.
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;

    return { year, month, day };
  }

  parseDayMonthToken(dayMonthToken) {
    if (!dayMonthToken) return null;

    const match = String(dayMonthToken).trim().match(/^(\d{1,2})([A-Za-z]{3})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const mon = match[2];

    const monthMap = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };

    const month = monthMap[mon];
    if (month === undefined) return null;

    return { month, day };
  }

  /**
   * Parse header information from roster
   * @param {Array} lines - Array of text lines
   * @param {Object} roster - Roster object to populate
   */
  parseHeader(lines, roster) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Capture bid period number when present (e.g. "Bid Period 3725")
      if (line.includes('Bid Period')) {
        const match = line.match(/\bBid\s+Period\s+(\d{3,6})\b/i);
        if (match) {
          if (!roster.summary) roster.summary = {};
          roster.summary.bidPeriod = match[1];
        }
      }
      
      // Extract employee information
      if (line.includes('Name    :')) {
        const match = line.match(/Name\s+:\s+(.+?)\s{2,}/);
        if (match) roster.employee.name = match[1].trim();
      }
      
      if (line.includes('Staff No:')) {
        const match = line.match(/Staff No:\s+(\d+)/);
        if (match) roster.employee.staffNo = match[1].trim();
      }
      
      if (line.includes('Category:')) {
        const match = line.match(/Category:\s+(.+?)$/);
        if (match) roster.employee.category = match[1].trim();
      }
      
      if (line.includes('Base    :')) {
        const match = line.match(/Base\s+:\s+(\w+)/);
        if (match) roster.employee.base = match[1].trim();
      }
      
      if (line.includes('Line    :')) {
        const match = line.match(/Line\s+:\s+(\w+)/);
        if (match) roster.employee.line = match[1].trim();
      }

      // Stop parsing header when we reach the roster data header
      if (line.includes('Date') && line.includes('Duty(Role)')) {
        break;
      }
    }
  }

  parseSummary(lines, roster) {
    // Example: Available Date/Time this (next) BP       : 29Dec25 0000 (26Jan26 0000)
    for (const line of lines) {
      if (!(line.includes('Available Date/Time this') && line.includes('BP'))) continue;

      const tokens = line.match(/\d{1,2}[A-Za-z]{3}\d{2}/g) || [];
      if (!roster.summary.periodStart && tokens.length >= 1) {
        const start = this.parseRosterDateToken(tokens[0]);
        if (start) roster.summary.periodStart = start;
      }
      if (!roster.summary.periodEnd && tokens.length >= 2) {
        const end = this.parseRosterDateToken(tokens[1]);
        if (end) roster.summary.periodEnd = end;
      }

      // Only one such line expected
      break;
    }
  }

  parsePatternDetails(lines, roster) {
    let anchor = roster.summary && roster.summary.periodStart ? roster.summary.periodStart : null;

    // Some sample rosters may not include the 'Available Date/Time...' period line.
    // Fall back to the first 'DATED ddMonYY' token in Pattern Details.
    if (!anchor) {
      for (const line of lines) {
        const match = line.match(/\bDATED\s+(\d{1,2}[A-Za-z]{3}\d{2})\b/);
        if (!match) continue;
        anchor = this.parseRosterDateToken(match[1]);
        if (anchor) break;
      }
    }

    if (!anchor) return;

    let currentYear = anchor.year;
    let currentMonth = anchor.month;
    let previousMonth = currentMonth;
    let previousDay = anchor.day;

    // A Pattern Details block can contain multiple duty periods (multiple Rpt/Rls lines)
    // under a single duty code (e.g. 8130, 8198). We emit one dutyPattern per duty period.
    let currentDutyLegs = [];
    let pendingDutyPatterns = [];

    for (const line of lines) {
      // Capture report/release line inside a pattern block
      // Examples:
      // "                 Rpt  0700 Rls  2028        ADL   17:02   7:05 10:58   7:05"
      // "                 Rpt  0430 Rls  0954                      3:36  5:24   3:40"
      const rptRlsMatch = line.match(/\bRpt\s+(\d{4})\s+Rls\s+(\d{4})\b/);
      if (rptRlsMatch) {
        const reportTime = rptRlsMatch[1];
        const releaseTime = rptRlsMatch[2];

        // Only emit a duty pattern if we have legs for this duty period.
        if (currentDutyLegs.length > 0) {
          const firstLeg = currentDutyLegs[0];
          const lastLeg = currentDutyLegs[currentDutyLegs.length - 1];

          const reportPort = firstLeg.departPort;

          // Heuristic: last 3-letter token on the line is often the release port.
          // If no port appears on the Rpt/Rls line, fall back to the last leg's arrive port.
          const ports = line.match(/\b[A-Z]{3}\b/g) || [];
          const releasePort = ports.length > 0 ? ports[ports.length - 1] : lastLeg.arrivePort;

          pendingDutyPatterns.push({
            dutyCode: null,
            // Use the first leg's date for this duty period; the block-level DATED token
            // represents the pattern/trip start and is not suitable for later duty days.
            dated: { year: firstLeg.year, month: firstLeg.month, day: firstLeg.day },
            reportTime,
            reportPort,
            releaseTime,
            releasePort,
            legs: currentDutyLegs
          });
        }

        // Reset for next duty period within the same pattern block.
        currentDutyLegs = [];
      }

      // Capture duty code + dated token to finalize a pattern block
      // Example: "                                                         8041A1 DATED 29Jan26"
      const dutyDatedMatch = line.match(/\b([A-Z0-9]{2,})\s+DATED\s+(\d{1,2}[A-Za-z]{3}\d{2})\b/);
      if (dutyDatedMatch) {
        const dutyCode = dutyDatedMatch[1];

        // If we have any un-finalized legs without a Rpt/Rls line (unexpected), drop them.
        // Most rosters provide one Rpt/Rls line per duty period.
        currentDutyLegs = [];

        // Apply the duty code to all pending duty periods and emit them.
        for (const p of pendingDutyPatterns) {
          p.dutyCode = dutyCode;
          roster.dutyPatterns.push(p);
        }

        pendingDutyPatterns = [];

        continue;
      }

      // Pattern Details flight line example:
      // 29Dec       768  PER  0709 MEL  1342  73H   3:33 ...
      // 16Jul P     937  BNE  1315 PER  1648  73H   0:00 ...
      // 07Nov A     780  PER  1554 MEL  2226  332   0:00 ... (alternate pax)
      const match = line.match(/^\s*(\d{1,2}[A-Za-z]{3})\s+([PA]\s+)?(\d{1,4})\s+([A-Z]{3})\s+(\d{4})\s+([A-Z]{3})\s+(\d{4})\b/);
      if (!match) continue;

      const flightNumber = this.normalizeFlightNumber(match[3]);

      const dayMonth = this.parseDayMonthToken(match[1]);
      if (!dayMonth) continue;

      // Detect month/year rollover using the Pattern Details date tokens.
      // Month is explicit; year is inferred by rollover from the roster period start.
      if (dayMonth.month !== currentMonth) {
        // If month goes "backwards" in calendar, assume year rollover.
        if (dayMonth.month < previousMonth) {
          currentYear += 1;
        }
        currentMonth = dayMonth.month;
        previousMonth = currentMonth;
      }

      // Guard against day rollover anomalies by updating previousDay.
      if (dayMonth.day < previousDay && dayMonth.month === currentMonth) {
        // Day decreased within same month; keep going (Pattern Details can jump between patterns)
        previousDay = dayMonth.day;
      } else {
        previousDay = dayMonth.day;
      }

      roster.flights.push({
        year: currentYear,
        month: currentMonth,
        day: dayMonth.day,
        flightNumber,
        passive: Boolean(match[2]),
        departPort: match[4],
        departTime: match[5],
        arrivePort: match[6],
        arriveTime: match[7]
      });

      currentDutyLegs.push({
        year: currentYear,
        month: currentMonth,
        day: dayMonth.day,
        flightNumber,
        passive: Boolean(match[2]),
        departPort: match[4],
        departTime: match[5],
        arrivePort: match[6],
        arriveTime: match[7]
      });
    }
  }

  /**
   * Parse roster entries from the main roster table
   * @param {Array} lines - Array of text lines
   * @param {Object} roster - Roster object to populate
   */
  parseRosterEntries(lines, roster) {
    let inDataSection = false;
    let lastFlightDutyCode = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if we're entering the data section
      if (line.includes('Date') && line.includes('Duty(Role)')) {
        inDataSection = true;
        continue;
      }
      
      // Stop if we reach the summary section
      if (line.includes('Total Duty Hours') || line.includes('*** End of Report ***')) {
        break;
      }
      
      if (!inDataSection) continue;
      
      // Skip separator lines
      if (line.match(/^-+$/)) continue;
      
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Parse roster line
      const entry = this.parseRosterLine(line);
      if (entry) {
        // The roster table can contain continuation lines for multi-day trips/patterns
        // where the Duty(Role) column is blank. In those cases, carry forward the
        // last seen flight duty code so downstream consumers (e.g. Pattern Details
        // enrichment) can match the correct duty/credit hours.
        if (entry.dutyType === 'FLIGHT' || entry.dutyType === 'SIMULATOR') {
          if (entry.dutyCode) {
            lastFlightDutyCode = entry.dutyCode;
          } else if (lastFlightDutyCode) {
            entry.dutyCode = lastFlightDutyCode;
          }
        } else {
          lastFlightDutyCode = null;
        }

        roster.entries.push(entry);
      }
    }
    
    // Assign month/year to entries and handle month rollovers
    // This supports rosters spanning multiple months (e.g., Feb 23 - Mar 23)
    this.assignMonthYearToEntries(roster);
  }

  /**
   * Parse a single roster line
   * @param {string} line - A single line from the roster
   * @returns {Object|null} Parsed entry or null if invalid
   */
  parseRosterLine(line) {
    // Skip if line doesn't start with a date pattern
    if (!line.match(/^\d{1,2}\s+\w{3}/)) {
      return null;
    }

    // Extract components using positional parsing
    // Format: Date  Duty(Role)  Service  S-On S-Of Duty  Credit Port Code
    const dateMatch = line.match(/^(\d{1,2})\s+(\w{3})/);
    if (!dateMatch) return null;

    const day = parseInt(dateMatch[1]);
    const dayOfWeek = dateMatch[2];
    
    // Extract the rest of the line after the day of week
    const restOfLine = line.substring(dateMatch[0].length).trim();
    
    const entry = {
      day: day,
      dayOfWeek: dayOfWeek,
      date: `${day} ${dayOfWeek}`
    };

    // Check if this is a continuation line (no duty code, starts with service)
    // Continuation lines can have various service formats:
    // - Flight numbers: 460/653, P936
    // - Simulator codes: &SIM06CA, &SIM06CB
    // - Aircraft types (passive positioning): A780, A332
    // The key indicator is significant whitespace before the first token (no duty code in that column)
    const lineAfterDate = line.substring(dateMatch[0].length);
    const hasSignificantLeadingWhitespace = lineAfterDate.match(/^\s{8,}/); // 8+ spaces indicates empty duty column
    
    const serviceOnlyMatch = restOfLine.match(/^\s*([&A-Z]?[A-Z0-9]+(?:\/[A-Z0-9]+)?)\s+(\d{4})\s+(\d{4})/);
    if (serviceOnlyMatch && hasSignificantLeadingWhitespace) {
      entry.dutyType = 'FLIGHT';
      const rawServiceToken = serviceOnlyMatch[1];
      
      // Check for simulator sessions (starting with &)
      if (rawServiceToken.startsWith('&')) {
        entry.dutyType = 'SIMULATOR';
        entry.service = rawServiceToken;
        entry.description = `Simulator ${rawServiceToken}`;
      }
      // Check for alternate PAX flights (starting with A followed by digits, e.g., A780)
      else if (rawServiceToken.match(/^A\d{3,4}$/)) {
        entry.passive = true;
        // Strip the 'A' prefix and normalize as flight number
        const flightNum = rawServiceToken.substring(1);
        entry.service = this.normalizeFlightNumber(flightNum);
        entry.description = `Alternate PAX ${entry.service}`;
      }
      // Check for passive flights (starting with P)
      else if (rawServiceToken.startsWith('P')) {
        entry.passive = true;
        entry.service = this.normalizeService(rawServiceToken);
        entry.description = `Passive Flight ${entry.service}`;
      }
      // Regular flight continuation
      else {
        entry.service = this.normalizeService(rawServiceToken);
      }
      
      entry.signOn = serviceOnlyMatch[2];
      entry.signOff = serviceOnlyMatch[3];
      
      // Parse duty and credit hours
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        entry.creditHours = hoursMatch[2];
      }
      
      // Parse port if present
      const portMatch = restOfLine.match(/\b([A-Z]{3})\s*$/);
      if (portMatch) {
        entry.port = portMatch[1];
      }
      
      return entry;
    }

    // Parse duty code (first non-whitespace token)
    const dutyMatch = restOfLine.match(/^(\S+)/);
    if (!dutyMatch) {
      return entry;
    }

    entry.dutyCode = dutyMatch[1];
    
    // Check for specific duty types
    if (entry.dutyCode === 'D/O') {
      entry.dutyType = 'DAY_OFF';
      entry.description = 'Day Off';
      // Extract code at the end if present
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode === 'PLN') {
      entry.dutyType = 'PERSONAL_LEAVE';
      entry.description = 'Personal Leave';
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode.match(/^SIM\w+\(T\)$/)) {
      // Simulator duty with (T) suffix - e.g., SIM06CA(T)
      entry.dutyType = 'SIMULATOR';
      entry.description = `Simulator ${entry.dutyCode}`;
      // Parse times if present
      const timeMatch = restOfLine.match(/(\d{4})\s+(\d{4})/);
      if (timeMatch) {
        entry.signOn = timeMatch[1];
        entry.signOff = timeMatch[2];
      }
      // Parse duty and credit hours
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        entry.creditHours = hoursMatch[2];
      }
      const codeMatch = restOfLine.match(/\s+([A-Z]{2}\d{2})\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode.match(/^EP\d+$/)) {
      entry.dutyType = 'EMERGENCY_PROCEDURES';
      entry.description = `Emergency Procedures ${entry.dutyCode}`;
      // Parse times if present
      const timeMatch = restOfLine.match(/(\d{4})\s+(\d{4})/);
      if (timeMatch) {
        entry.signOn = timeMatch[1];
        entry.signOff = timeMatch[2];
      }
      // Parse duty and credit hours
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        entry.creditHours = hoursMatch[2];
      }
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode.match(/^R\d+$/)) {
      entry.dutyType = 'RESERVE';
      entry.description = `Reserve Duty ${entry.dutyCode}`;
      // Parse times if present
      const timeMatch = restOfLine.match(/(\d{4})\s+(\d{4})/);
      if (timeMatch) {
        entry.signOn = timeMatch[1];
        entry.signOff = timeMatch[2];
      }
      // Parse duty hours - reserve duties show duty hours but not credit hours in roster
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})(\s+(\d{1,2}:\d{2}))?/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        // Reserve duties always attract 4:00 credit hours even if not shown in roster
        entry.creditHours = hoursMatch[3] || '4:00';
      } else {
        // If no hours parsed at all, still apply the 4:00 credit default
        entry.creditHours = '4:00';
      }
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode === 'AV') {
      entry.dutyType = 'AVAILABLE_DAY';
      entry.description = 'Available Day';
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode === 'AL' || entry.dutyCode === 'LA') {
      entry.dutyType = 'ANNUAL_LEAVE';
      entry.description = 'Annual Leave';
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode === 'BL') {
      entry.dutyType = 'BLANK_DAY';
      entry.description = 'Blank Day';
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else {
      entry.dutyType = 'FLIGHT';

      let rawServiceToken;
      
      // Parse service (could be flight number or multiple flights)
      // Service can be: flight numbers (123, 123/456), passive (P123), or alternate PAX (A780)
      const serviceMatch = restOfLine.match(/^\S+\s+([PA]?\d+(?:\/[PA]?\d+)?)/);
      if (serviceMatch) {
        rawServiceToken = serviceMatch[1];

        // Check for alternate PAX flights (starting with A)
        if (rawServiceToken.startsWith('A') && rawServiceToken.match(/^A\d{3,4}$/)) {
          entry.passive = true;
          // Strip the 'A' prefix and normalize as flight number
          const flightNum = rawServiceToken.substring(1);
          entry.service = this.normalizeFlightNumber(flightNum);
          entry.description = `Alternate PAX ${entry.service}`;
        }
        // Check for passive flights (starting with P) before normalization.
        else if (rawServiceToken.startsWith('P')) {
          entry.passive = true;
          entry.service = this.normalizeService(rawServiceToken);
        }
        else {
          entry.service = this.normalizeService(rawServiceToken);
        }
      }
      
      // Parse times - look for 4-digit time patterns
      // Make sure we skip the service field by starting after it
      const afterService = rawServiceToken
        ? restOfLine.substring(restOfLine.indexOf(rawServiceToken) + rawServiceToken.length)
        : restOfLine;
      
      const times = afterService.match(/\b(\d{4})\s+(\d{4})\b/);
      if (times) {
        entry.signOn = times[1];
        entry.signOff = times[2];
      }
      
      // Parse duty and credit hours
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        entry.creditHours = hoursMatch[2];
      }
      
      // Parse port (3-letter code before the final code)
      const portMatch = restOfLine.match(/\b([A-Z]{3})\s+[A-Z0-9]+\s*$/);
      if (portMatch) {
        entry.port = portMatch[1];
      }
      
      // Parse final code
      const codeMatch = restOfLine.match(/\b([A-Z]{2}\d{2})\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    }

    return entry;
  }

  /**
   * Assign month and year to each roster entry
   * Handles rosters that span multiple months (e.g., Feb 23 - Mar 23)
   * @param {Object} roster - Parsed roster object
   */
  assignMonthYearToEntries(roster) {
    if (roster.entries.length === 0) return;

    const period = this.getRosterPeriod(roster);
    let currentMonth = period.startMonth;
    let currentYear = period.startYear;

    const firstDay = roster.entries[0].day;
    let previousDay = firstDay;

    for (const entry of roster.entries) {
      // Detect month rollover: if day number decreases significantly, we've moved to next month
      // Use threshold to distinguish rollover from legitimate decreases within same month
      if (entry.day < previousDay && previousDay - entry.day > 7) {
        currentMonth = (currentMonth + 1) % 12;
        if (currentMonth === 0) currentYear += 1;
      }

      entry.month = currentMonth;
      entry.year = currentYear;
      previousDay = entry.day;
    }
  }

  /**
   * Extract month and year from roster
   * @param {Object} roster - Parsed roster object
   * @returns {Object} Object with month and year
   */
  getMonthYear(roster) {
    if (roster.summary && roster.summary.periodStart) {
      return {
        month: roster.summary.periodStart.month,
        year: roster.summary.periodStart.year
      };
    }

    const inferred = this.inferPeriodStartFromDatedLegs(roster);
    if (inferred) return inferred;

    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  }

  /**
   * Get roster period from entries
   * Analyzes entries to determine the month(s) covered
   * @param {Object} roster - Parsed roster object
   * @returns {Object} Object with startMonth, startYear, endMonth, endYear
   */
  getRosterPeriod(roster) {
    if (roster.summary && roster.summary.periodStart) {
      const startMonth = roster.summary.periodStart.month;
      const startYear = roster.summary.periodStart.year;

      if (roster.summary.periodEnd) {
        return {
          startMonth,
          startYear,
          endMonth: roster.summary.periodEnd.month,
          endYear: roster.summary.periodEnd.year
        };
      }

      // Fall back to inferring rollover from entries if we only have a start
      let endMonth = startMonth;
      let endYear = startYear;
      if (roster.entries.length > 0) {
        const firstDay = roster.entries[0].day;
        const lastDay = roster.entries[roster.entries.length - 1].day;
        if (lastDay < firstDay) {
          endMonth = (startMonth + 1) % 12;
          if (endMonth === 0) endYear = startYear + 1;
        }
      }

      return { startMonth, startYear, endMonth, endYear };
    }

    // If the roster header doesn't include an explicit period start/end, prefer inferring
    // the month/year from Pattern Details (dated flight legs) over using the current month.
    // This avoids mis-applying rosters when they are ingested in a different month.
    const inferred = this.inferPeriodStartFromDatedLegs(roster);
    if (inferred) {
      const startMonth = inferred.month;
      const startYear = inferred.year;

      let endMonth = startMonth;
      let endYear = startYear;

      const entries = roster && Array.isArray(roster.entries) ? roster.entries : [];
      if (entries.length > 0) {
        const firstDay = entries[0].day;
        const lastDay = entries[entries.length - 1].day;
        if (Number.isFinite(firstDay) && Number.isFinite(lastDay) && lastDay < firstDay) {
          endMonth = (startMonth + 1) % 12;
          if (endMonth === 0) endYear = startYear + 1;
        }
      }

      return { startMonth, startYear, endMonth, endYear };
    }

    if (roster.entries.length === 0) {
      const now = new Date();
      return {
        startMonth: now.getMonth(),
        startYear: now.getFullYear(),
        endMonth: now.getMonth(),
        endYear: now.getFullYear()
      };
    }

    // Get first and last day numbers
    const firstDay = roster.entries[0].day;
    const lastDay = roster.entries[roster.entries.length - 1].day;

    // If last day < first day, we've crossed into next month
    const now = new Date();
    let startMonth = now.getMonth();
    let startYear = now.getFullYear();
    let endMonth = startMonth;
    let endYear = startYear;

    if (lastDay < firstDay) {
      endMonth = (startMonth + 1) % 12;
      if (endMonth === 0) {
        endYear = startYear + 1;
      }
    }

    return { startMonth, startYear, endMonth, endYear };
  }

  /**
   * Convert credit hours string (e.g., "7:30") to decimal hours (e.g., 7.5)
   * @param {string} creditHours - Credit hours in HH:MM format
   * @returns {number|null} - Decimal hours or null if invalid
   */
  static creditHoursToDecimal(creditHours) {
    if (!creditHours || typeof creditHours !== 'string') return null;
    
    const match = creditHours.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60 || hours >= 24) {
      return null;
    }
    
    return hours + (minutes / 60);
  }

  /**
   * Calculate the monetary value of a duty based on credit hours and pay rate
   * @param {string} creditHours - Credit hours in HH:MM format
   * @param {number} payRate - Hourly pay rate
   * @returns {number|null} - Duty value or null if calculation not possible
   */
  static calculateDutyValue(creditHours, payRate) {
    if (!Number.isFinite(payRate) || payRate < 0) return null;
    
    const decimalHours = QantasRosterParser.creditHoursToDecimal(creditHours);
    if (decimalHours === null) return null;
    
    return decimalHours * payRate;
  }

  /**
   * Enrich roster entries with duty value calculations
   * @param {Object} roster - Parsed roster object
   * @param {number} payRate - Hourly pay rate
   * @returns {Object} - Roster with dutyValue added to entries that have creditHours
   */
  static enrichRosterWithDutyValues(roster, payRate) {
    if (!roster || typeof roster !== 'object') return roster;
    if (!Number.isFinite(payRate) || payRate < 0) return roster;

    const enrichedRoster = { ...roster };
    
    if (Array.isArray(enrichedRoster.entries)) {
      enrichedRoster.entries = enrichedRoster.entries.map(entry => {
        if (!entry || !entry.creditHours) return entry;
        
        const dutyValue = QantasRosterParser.calculateDutyValue(entry.creditHours, payRate);
        if (dutyValue === null) return entry;
        
        return {
          ...entry,
          dutyValue: Math.round(dutyValue * 100) / 100 // Round to 2 decimal places
        };
      });
    }
    
    // Calculate total duty value for the roster
    if (Array.isArray(enrichedRoster.entries)) {
      const totalValue = enrichedRoster.entries.reduce((sum, entry) => {
        return sum + (entry.dutyValue || 0);
      }, 0);
      
      enrichedRoster.summary = {
        ...enrichedRoster.summary,
        totalDutyValue: Math.round(totalValue * 100) / 100,
        payRate: payRate
      };
    }

    return enrichedRoster;
  }
}

module.exports = QantasRosterParser;

/**
 * Service to convert roster data to ICS calendar format
 */

const ics = require('ics');
const TimezoneService = require('./timezone-service');
const { DateTime } = require('luxon');
const crypto = require('crypto');

class ICSCalendarService {
  constructor() {
    this.timezoneService = new TimezoneService();
  }

  normalizePort(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toUpperCase();
  }

  parseHHMMToMinutes(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || minutes < 0 || minutes >= 60) return null;
    return hours * 60 + minutes;
  }

  formatMinutesAsHMM(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined) return null;
    const mins = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  calculatePaidMinutesForDuty({ dutyMinutes, creditMinutes }) {
    if (!Number.isFinite(dutyMinutes)) return null;

    const minMinutes = Math.ceil(dutyMinutes * 0.6);
    const credit = Number.isFinite(creditMinutes) ? creditMinutes : null;

    if (credit === null) {
      return { paidMinutes: minMinutes, basis: 'DPC60', minMinutes, creditMinutes: null };
    }

    if (credit >= minMinutes) {
      return { paidMinutes: credit, basis: 'CREDIT', minMinutes, creditMinutes: credit };
    }

    return { paidMinutes: minMinutes, basis: 'DPC60', minMinutes, creditMinutes: credit };
  }

  buildPayLine({ dutyHours, creditHours }) {
    const dutyMinutes = this.parseHHMMToMinutes(dutyHours);
    const creditMinutes = this.parseHHMMToMinutes(creditHours);
    if (!Number.isFinite(dutyMinutes)) return null;

    const calc = this.calculatePaidMinutesForDuty({ dutyMinutes, creditMinutes });
    if (!calc) return null;

    const paid = this.formatMinutesAsHMM(calc.paidMinutes);
    const min = this.formatMinutesAsHMM(calc.minMinutes);
    const credit = this.formatMinutesAsHMM(calc.creditMinutes);

    // Keep this short and scannable in calendar clients.
    // Examples:
    // - DPC60 wins:  "Pay: 6:00 (DPC60; roster credit 5:00)"
    // - Credit wins: "Pay: 7:14 (credit; DPC60 min 5:00)"
    if (calc.basis === 'DPC60') {
      if (credit) return `Pay: ${paid} (DPC60; roster credit ${credit})`;
      return `Pay: ${paid} (DPC60)`;
    }

    return `Pay: ${paid} (credit; DPC60 min ${min})`;
  }

  stableUidForEntry({ year, month, day, entry, employee }) {
    const payload = {
      year,
      month,
      day,
      dutyType: entry && entry.dutyType,
      dutyCode: entry && entry.dutyCode,
      service: entry && entry.service,
      port: entry && entry.port,
      signOn: entry && entry.signOn,
      signOff: entry && entry.signOff,
      passive: entry && entry.passive,
      base: employee && employee.base
    };

    const hash = crypto
      .createHash('sha1')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 16);

    return `${year}-${month + 1}-${day}-${hash}@roster-calendar`;
  }

  /**
   * Convert roster to ICS format
   * @param {Object} roster - Parsed roster data
   * @returns {Promise<string>} ICS calendar string
   */
  async generateICS(roster) {
    const events = this.convertRosterToEvents(roster);
    
    return new Promise((resolve, reject) => {
      ics.createEvents(events, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * Convert multiple rosters into a single ICS calendar string.
   * Events are merged and de-duplicated by UID.
   * @param {Array<Object>} rosters - Array of parsed roster objects
   * @returns {Promise<string>} ICS calendar string
   */
  async generateICSForRosters(rosters) {
    const events = this.convertRostersToEvents(rosters);

    return new Promise((resolve, reject) => {
      ics.createEvents(events, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * Convert multiple rosters to a merged set of events.
   * @param {Array<Object>} rosters
   * @returns {Array}
   */
  convertRostersToEvents(rosters) {
    const rosterList = Array.isArray(rosters) ? rosters.filter(Boolean) : [];
    const allEvents = [];

    for (const roster of rosterList) {
      const events = this.convertRosterToEvents(roster);
      for (const event of events) {
        allEvents.push(event);
      }
    }

    // Deduplicate by UID (ics library uses uid as event identifier)
    const byUid = new Map();
    for (const event of allEvents) {
      if (!event || !event.uid) continue;
      if (!byUid.has(event.uid)) {
        byUid.set(event.uid, event);
      }
    }

    const merged = Array.from(byUid.values());
    // Stable ordering helps keep diffs small for subscribers
    merged.sort((a, b) => {
      const aStart = Array.isArray(a.start) ? a.start.join('-') : '';
      const bStart = Array.isArray(b.start) ? b.start.join('-') : '';
      if (aStart < bStart) return -1;
      if (aStart > bStart) return 1;
      const aUid = String(a.uid);
      const bUid = String(b.uid);
      return aUid.localeCompare(bUid);
    });

    return merged;
  }

  /**
   * Convert roster entries to calendar events
   * @param {Object} roster - Parsed roster data
   * @returns {Array} Array of event objects
   */
  convertRosterToEvents(roster) {
    const events = [];
    const QantasRosterParser = require('../parsers/qantas-roster-parser');
    const parser = new QantasRosterParser();
    const period = parser.getRosterPeriod(roster);

    const hasDutyPatterns = Array.isArray(roster.dutyPatterns) && roster.dutyPatterns.length > 0;

    // Pre-compute (year, month) for each entry (roster table only gives day-of-month).
    // Also index flight-duty rows so Pattern Details duty events can be enriched with duty/credit hours.
    let currentMonth = period.startMonth;
    let currentYear = period.startYear;
    let previousDay = 0;
    const entriesWithDates = [];
    const flightEntryByKey = new Map();

    for (const entry of roster.entries) {
      if (!entry) continue;

      if (entry.day < previousDay) {
        currentMonth = (currentMonth + 1) % 12;
        if (currentMonth === 0) currentYear++;
      }
      previousDay = entry.day;

      entriesWithDates.push({ entry, month: currentMonth, year: currentYear });

      if (entry.dutyType === 'FLIGHT' && entry.dutyCode) {
        const key = `${currentYear}-${currentMonth}-${entry.day}-${entry.dutyCode}`;
        const existing = flightEntryByKey.get(key);
        const existingScore = (existing && (existing.dutyHours || existing.creditHours)) ? 1 : 0;
        const candidateScore = (entry.dutyHours || entry.creditHours) ? 1 : 0;
        if (!existing || candidateScore > existingScore) {
          flightEntryByKey.set(key, entry);
        }
      }
    }

    // Prefer dutyPatterns for flight duty events (timezone-correct report/release)
    if (hasDutyPatterns) {
      for (const dutyPattern of roster.dutyPatterns) {
        const startDate = dutyPattern && dutyPattern.dated ? dutyPattern.dated : null;
        const dutyCode = dutyPattern && dutyPattern.dutyCode ? dutyPattern.dutyCode : null;
        const key = (startDate && dutyCode)
          ? `${startDate.year}-${startDate.month}-${startDate.day}-${dutyCode}`
          : null;
        const matchingEntry = key ? flightEntryByKey.get(key) : null;

        const dutyEvent = this.createDutyEventFromPattern(dutyPattern, roster.employee, matchingEntry);
        if (dutyEvent) events.push(dutyEvent);
      }

      // Add all-day Pattern events for multi-day pairings (away from base)
      const patternEvents = this.createAllDayPatternEventsFromDutyPatterns(roster.dutyPatterns, roster.employee);
      for (const e of patternEvents) events.push(e);
    }

    for (const { entry, month, year } of entriesWithDates) {
      if (!entry) continue;

      // If we have Pattern Details, flight duty events come from dutyPatterns to avoid duplicates
      if (hasDutyPatterns && entry.dutyType === 'FLIGHT') {
        continue;
      }

      const event = this.createEventFromEntry(entry, month, year, roster.employee);
      if (event) events.push(event);
    }

    // Add individual flight-leg events if Pattern Details were parsed
    if (Array.isArray(roster.flights) && roster.flights.length > 0) {
      for (const flightLeg of roster.flights) {
        const flightEvent = this.createEventFromFlightLeg(flightLeg, roster.employee);
        if (flightEvent) events.push(flightEvent);
      }
    }

    return events;
  }

  getDutyPatternWindow(dutyPattern, employee) {
    if (!dutyPattern || !Array.isArray(dutyPattern.legs) || dutyPattern.legs.length === 0) return null;

    const startDate = dutyPattern.dated
      ? { year: dutyPattern.dated.year, month: dutyPattern.dated.month, day: dutyPattern.dated.day }
      : { year: dutyPattern.legs[0].year, month: dutyPattern.legs[0].month, day: dutyPattern.legs[0].day };

    const endLeg = dutyPattern.legs[dutyPattern.legs.length - 1];
    const endDate = { year: endLeg.year, month: endLeg.month, day: endLeg.day };

    const reportPort = dutyPattern.reportPort || dutyPattern.legs[0].departPort || (employee && employee.base);
    const releasePort = dutyPattern.releasePort || endLeg.arrivePort || (employee && employee.base);

    const reportTz = this.getTimezoneForPortOrBase(reportPort, employee);
    const releaseTz = this.getTimezoneForPortOrBase(releasePort, employee);

    const reportTime = this.parseTime(dutyPattern.reportTime);
    const releaseTime = this.parseTime(dutyPattern.releaseTime);

    if (!reportTime || !releaseTime || !reportTz || !releaseTz) return null;

    const startUtc = this.toUtcDateArray({
      year: startDate.year,
      month: startDate.month + 1,
      day: startDate.day,
      time: reportTime,
      timezone: reportTz
    });

    let addReleaseDays = 0;
    let endUtc = this.toUtcDateArray({
      year: endDate.year,
      month: endDate.month + 1,
      day: endDate.day,
      time: releaseTime,
      timezone: releaseTz
    });

    if (!startUtc || !endUtc) return null;

    const startDt = DateTime.utc(...startUtc);
    let endDt = DateTime.utc(...endUtc);
    if (endDt < startDt) {
      addReleaseDays = 1;
      endUtc = this.toUtcDateArray({
        year: endDate.year,
        month: endDate.month + 1,
        day: endDate.day,
        time: releaseTime,
        timezone: releaseTz,
        addDays: 1
      });
      if (!endUtc) return null;
      endDt = DateTime.utc(...endUtc);
    }

    const localEnd = DateTime.fromObject(
      { year: endDate.year, month: endDate.month + 1, day: endDate.day, hour: releaseTime[0], minute: releaseTime[1] },
      { zone: releaseTz }
    ).plus({ days: addReleaseDays });

    if (!localEnd.isValid) return null;

    return {
      dutyCode: dutyPattern.dutyCode || null,
      reportPort,
      releasePort,
      reportTimeStr: dutyPattern.reportTime || '',
      releaseTimeStr: dutyPattern.releaseTime || '',
      startDate,
      endDate,
      startUtc,
      endUtc,
      startDt,
      endDt,
      endLocalDate: { year: localEnd.year, month: localEnd.month, day: localEnd.day }
    };
  }

  createAllDayPatternEventsFromDutyPatterns(dutyPatterns, employee) {
    const patterns = Array.isArray(dutyPatterns) ? dutyPatterns.filter(Boolean) : [];
    if (patterns.length === 0) return [];

    const base = this.normalizePort(employee && employee.base);
    if (!base) return [];

    const byDutyCode = new Map();
    for (const p of patterns) {
      const code = p && p.dutyCode ? String(p.dutyCode).trim() : '';
      if (!code) continue;
      if (!byDutyCode.has(code)) byDutyCode.set(code, []);
      byDutyCode.get(code).push(p);
    }

    const events = [];
    for (const [dutyCode, group] of byDutyCode.entries()) {
      if (!Array.isArray(group) || group.length < 2) continue;

      const windows = group
        .map(p => this.getDutyPatternWindow(p, employee))
        .filter(Boolean)
        .sort((a, b) => a.startDt.toMillis() - b.startDt.toMillis());

      if (windows.length < 2) continue;

      const first = windows[0];
      const last = windows[windows.length - 1];

      const startPort = this.normalizePort(first.reportPort);
      const endPort = this.normalizePort(last.releasePort);

      // Skip patterns that are entirely at base across all duty periods.
      const allAtBase = windows.every(w =>
        this.normalizePort(w.reportPort) === base && this.normalizePort(w.releasePort) === base
      );
      if (allAtBase) continue;

      const startDate = first.startDate;
      const endLocalDate = last.endLocalDate;

      // Only for patterns that span more than one calendar day.
      if (
        startDate.year === endLocalDate.year &&
        startDate.month === endLocalDate.month &&
        startDate.day === endLocalDate.day
      ) {
        continue;
      }

      const endExclusive = DateTime
        .fromObject({ year: endLocalDate.year, month: endLocalDate.month, day: endLocalDate.day }, { zone: 'utc' })
        .plus({ days: 1 });

      // Slip (overnight) ports are inferred from consecutive duty periods where the
      // release port matches the next day's report port (common roster pattern).
      const slipPorts = [];
      const slipMinutesByPort = new Map();
      const longSlipMinutesByPort = new Map();
      const LONG_SLIP_THRESHOLD_MINUTES = 30 * 60;
      for (let i = 0; i < windows.length - 1; i++) {
        const a = windows[i];
        const b = windows[i + 1];
        const slip = this.normalizePort(a.releasePort);
        if (!slip || slip === base) continue;
        if (slip !== this.normalizePort(b.reportPort)) continue;

        const gapMinutes = Math.max(0, Math.round(b.startDt.diff(a.endDt, 'minutes').minutes));
        if (!slipMinutesByPort.has(slip)) slipMinutesByPort.set(slip, gapMinutes);
        if (gapMinutes > LONG_SLIP_THRESHOLD_MINUTES && !longSlipMinutesByPort.has(slip)) {
          longSlipMinutesByPort.set(slip, gapMinutes);
        }

        if (!slipPorts.includes(slip)) slipPorts.push(slip);
      }

      const longSlipPorts = Array.from(longSlipMinutesByPort.keys());

      const title = slipPorts.length > 0
        ? `Pattern: ${dutyCode} ${slipPorts.join(' ')}${longSlipPorts.length > 0 ? ' (Long Slip)' : ''}`
        : `Pattern: ${dutyCode}${longSlipPorts.length > 0 ? ' (Long Slip)' : ''}`;

      const dutyLines = windows
        .map(w => {
          const y = w.startDate.year;
          const m = String(w.startDate.month + 1).padStart(2, '0');
          const d = String(w.startDate.day).padStart(2, '0');
          const timeRange = (w.reportTimeStr || w.releaseTimeStr)
            ? `${String(w.reportTimeStr || '').trim()}-${String(w.releaseTimeStr || '').trim()}`.trim()
            : '';
          return `${y}-${m}-${d}: ${this.normalizePort(w.reportPort)}-${this.normalizePort(w.releasePort)}${timeRange ? ` ${timeRange}` : ''}`;
        })
        .join('\n');

      let description = `Pattern: ${dutyCode}\nAway from base: ${base}\nStart: ${startPort}\nEnd: ${endPort}`;

      if (slipPorts.length > 0) {
        description += `\nSlip ports: ${slipPorts.join(' ')}`;
      }
      if (longSlipPorts.length > 0) {
        const longSlipLines = longSlipPorts
          .map(p => `${p} ${this.formatMinutesAsHMM(longSlipMinutesByPort.get(p))}`)
          .join(', ');
        description += `\nLong slip credit: ${longSlipLines}`;
      }
      if (dutyLines) description += `\n\nDuties:\n${dutyLines}`;

      events.push({
        title,
        description,
        start: [startDate.year, startDate.month + 1, startDate.day],
        end: [endExclusive.year, endExclusive.month, endExclusive.day],
        productId: 'roster-calendar/ics',
        calName: `${employee.name || 'Pilot'} Roster`,
        uid: `${startDate.year}-${startDate.month + 1}-${startDate.day}-pattern-${String(dutyCode).trim()}@roster-calendar`
      });
    }

    return events;
  }

  getTimezoneForPortOrBase(port, employee) {
    return this.timezoneService.getTimezone(port || (employee && employee.base));
  }

  toUtcDateArray({ year, month, day, time, timezone, addDays = 0 }) {
    if (!timezone || !time) return null;
    const [hour, minute] = time;
    const dt = DateTime.fromObject(
      { year, month, day, hour, minute },
      { zone: timezone }
    ).plus({ days: addDays });

    if (!dt.isValid) return null;
    const utc = dt.toUTC();
    return [utc.year, utc.month, utc.day, utc.hour, utc.minute];
  }

  createDutyEventFromPattern(dutyPattern, employee, matchingEntry) {
    if (!dutyPattern || !Array.isArray(dutyPattern.legs) || dutyPattern.legs.length === 0) return null;

    // Determine start date: use DATED token if present, otherwise first leg date
    const startDate = dutyPattern.dated
      ? { year: dutyPattern.dated.year, month: dutyPattern.dated.month, day: dutyPattern.dated.day }
      : { year: dutyPattern.legs[0].year, month: dutyPattern.legs[0].month, day: dutyPattern.legs[0].day };

    const endLeg = dutyPattern.legs[dutyPattern.legs.length - 1];
    const endDate = { year: endLeg.year, month: endLeg.month, day: endLeg.day };

    const reportPort = dutyPattern.reportPort || dutyPattern.legs[0].departPort || (employee && employee.base);
    const releasePort = dutyPattern.releasePort || endLeg.arrivePort || (employee && employee.base);

    const reportTz = this.getTimezoneForPortOrBase(reportPort, employee);
    const releaseTz = this.getTimezoneForPortOrBase(releasePort, employee);

    const reportTime = this.parseTime(dutyPattern.reportTime);
    const releaseTime = this.parseTime(dutyPattern.releaseTime);

    if (!reportTime || !releaseTime || !reportTz || !releaseTz) return null;

    let startUtc = this.toUtcDateArray({
      year: startDate.year,
      month: startDate.month + 1,
      day: startDate.day,
      time: reportTime,
      timezone: reportTz
    });
    let endUtc = this.toUtcDateArray({
      year: endDate.year,
      month: endDate.month + 1,
      day: endDate.day,
      time: releaseTime,
      timezone: releaseTz
    });

    if (!startUtc || !endUtc) return null;

    // If end is before start in UTC, assume release time is next day in release TZ
    const startDt = DateTime.utc(...startUtc);
    let endDt = DateTime.utc(...endUtc);
    if (endDt < startDt) {
      endUtc = this.toUtcDateArray({
        year: endDate.year,
        month: endDate.month + 1,
        day: endDate.day,
        time: releaseTime,
        timezone: releaseTz,
        addDays: 1
      });
      endDt = DateTime.utc(...endUtc);
    }

    const title = `Duty: ${dutyPattern.dutyCode || 'Flight Duty'}`;

    const legSummary = dutyPattern.legs
      .map(l => `${l.flightNumber} ${l.departPort}-${l.arrivePort}`)
      .join(', ');

    let description = `Duty: ${dutyPattern.dutyCode || 'Flight Duty'}\nReport: ${reportPort} ${dutyPattern.reportTime || ''}\nRelease: ${releasePort} ${dutyPattern.releaseTime || ''}`;
    if (legSummary) description += `\nFlights: ${legSummary}`;

    // Add DPC60 pay indicator when we can.
    // Prefer the roster-table duty/credit hours if available; otherwise infer duty hours from UTC times.
    let payLine = null;
    if (matchingEntry && (matchingEntry.dutyHours || matchingEntry.creditHours)) {
      payLine = this.buildPayLine({ dutyHours: matchingEntry.dutyHours, creditHours: matchingEntry.creditHours });
    } else {
      const inferredDutyMinutes = Math.round(endDt.diff(startDt, 'minutes').minutes);
      const inferredDutyHours = this.formatMinutesAsHMM(inferredDutyMinutes);
      payLine = this.buildPayLine({ dutyHours: inferredDutyHours, creditHours: null });
    }
    if (payLine) description += `\n${payLine}`;

    description += `\n\nTimezone (Report): ${reportTz}\nTimezone (Release): ${releaseTz}`;

    return {
      title,
      description,
      start: startUtc,
      end: endUtc,
      productId: 'roster-calendar/ics',
      calName: `${employee.name || 'Pilot'} Roster`,
      uid: `${startUtc[0]}-${startUtc[1]}-${startUtc[2]}-duty-${dutyPattern.dutyCode || 'flight'}@roster-calendar`,
      startInputType: 'utc',
      startOutputType: 'utc',
      endInputType: 'utc',
      endOutputType: 'utc'
    };
  }

  createEventFromFlightLeg(flightLeg, employee) {
    if (!flightLeg) return null;

    const departTz = this.getTimezoneForPortOrBase(flightLeg.departPort, employee);
    const arriveTz = this.getTimezoneForPortOrBase(flightLeg.arrivePort, employee);
    const startTime = this.parseTime(flightLeg.departTime);
    const endTime = this.parseTime(flightLeg.arriveTime);
    if (!startTime || !endTime || !departTz || !arriveTz) return null;

    const localDepart = String(flightLeg.departTime || '').trim();
    const localArrive = String(flightLeg.arriveTime || '').trim();
    const timeRange = (localDepart && localArrive) ? `${localDepart}-${localArrive}` : '';
    const paxPrefix = flightLeg.passive ? 'PAX ' : '';

    const title = `${paxPrefix}${flightLeg.flightNumber} ${flightLeg.departPort}-${flightLeg.arrivePort}${timeRange ? ` ${timeRange}` : ''}`;

    let description = `Flight: ${flightLeg.flightNumber}\nFrom: ${flightLeg.departPort}\nTo: ${flightLeg.arrivePort}\nDepart: ${flightLeg.departTime}\nArrive: ${flightLeg.arriveTime}`;
    if (flightLeg.passive) description += `\nType: Passive (Positioning)`;
    description += `\n\nTimezone (Depart): ${departTz}\nTimezone (Arrive): ${arriveTz}`;

    let startUtc = this.toUtcDateArray({
      year: flightLeg.year,
      month: flightLeg.month + 1,
      day: flightLeg.day,
      time: startTime,
      timezone: departTz
    });
    let endUtc = this.toUtcDateArray({
      year: flightLeg.year,
      month: flightLeg.month + 1,
      day: flightLeg.day,
      time: endTime,
      timezone: arriveTz
    });

    if (!startUtc || !endUtc) return null;

    const startDt = DateTime.utc(...startUtc);
    let endDt = DateTime.utc(...endUtc);
    if (endDt < startDt) {
      endUtc = this.toUtcDateArray({
        year: flightLeg.year,
        month: flightLeg.month + 1,
        day: flightLeg.day,
        time: endTime,
        timezone: arriveTz,
        addDays: 1
      });
      endDt = DateTime.utc(...endUtc);
    }

    const event = {
      title,
      description,
      start: startUtc,
      productId: 'roster-calendar/ics',
      calName: `${employee.name || 'Pilot'} Roster`,
      uid: `${flightLeg.year}-${flightLeg.month + 1}-${flightLeg.day}-flight-${flightLeg.flightNumber}-${flightLeg.departPort}-${flightLeg.arrivePort}@roster-calendar`,
      startInputType: 'utc',
      startOutputType: 'utc'
    };

    event.end = endUtc;
    event.endInputType = 'utc';
    event.endOutputType = 'utc';
    return event;
  }

  /**
   * Create a calendar event from a roster entry
   * @param {Object} entry - Roster entry
   * @param {number} month - Month number (0-11)
   * @param {number} year - Year
   * @param {Object} employee - Employee information
   * @returns {Object|null} Event object or null if should be skipped
   */
  createEventFromEntry(entry, month, year, employee) {
    const day = entry.day;
    let title, description, startTime, endTime, duration, timezone;

    // Determine timezone from port or base
    const port = entry.port || employee.base;
    timezone = this.getTimezoneForPortOrBase(port, employee);

    switch (entry.dutyType) {
      case 'FLIGHT':
        title = entry.dutyCode ? `Duty: ${entry.dutyCode}` : 'Duty';
        if (entry.service) title += ` - ${entry.service}`;
        description = this.buildFlightDescription(entry);
        startTime = this.parseTime(entry.signOn);
        endTime = this.parseTime(entry.signOff);
        break;

      case 'DAY_OFF':
        title = 'Day Off';
        description = 'Day off';
        duration = { days: 1 };
        break;

      case 'AVAILABLE_DAY':
        title = 'Available Day';
        description = 'Available day';
        duration = { days: 1 };
        break;

      case 'BLOCK_LEAVE':
        title = 'Block Leave';
        description = 'Block leave';
        duration = { days: 1 };
        break;

      case 'RESERVE':
        title = `Reserve Duty: ${entry.dutyCode}`;
        description = `Reserve duty\nSign On: ${entry.signOn || 'N/A'}\nSign Off: ${entry.signOff || 'N/A'}`;
        startTime = this.parseTime(entry.signOn);
        endTime = this.parseTime(entry.signOff);
        break;

      case 'PERSONAL_LEAVE':
        title = 'Personal Leave';
        description = 'Personal leave';
        startTime = [9, 0]; // Default to 9 AM
        duration = { hours: 8 };
        break;

      case 'ANNUAL_LEAVE':
        title = 'Annual Leave';
        description = 'Annual leave';
        duration = { days: 1 };
        break;

      default:
        title = entry.dutyCode || 'Duty';
        description = `Duty: ${entry.description || entry.dutyCode}`;
        startTime = this.parseTime(entry.signOn);
        endTime = this.parseTime(entry.signOff);
        break;
    }

    // Create the event object
    const event = {
      title,
      description,
      start: duration && duration.days ? [year, month + 1, day] : [year, month + 1, day, ...(startTime || [0, 0])],
      productId: 'roster-calendar/ics',
      calName: `${employee.name || 'Pilot'} Roster`,
      uid: this.stableUidForEntry({ year, month, day, entry, employee })
    };

    // Add timezone information
    if (timezone) {
      // Store timezone info in description for now
      // The ics library has limited timezone support, so we document it
      event.description = `${description}\n\nTimezone: ${timezone}`;
      
      // For proper timezone support, calendar apps will use the timezone
      // embedded in the ICS file. The times are stored in UTC internally.
    }

    // Convert timed (non-all-day) entries to UTC so they display correctly everywhere.
    if (!duration || !duration.days) {
      if (startTime && timezone) {
        const startUtc = this.toUtcDateArray({ year, month: month + 1, day, time: startTime, timezone });
        if (startUtc) {
          event.start = startUtc;
          event.startInputType = 'utc';
          event.startOutputType = 'utc';
        }
      }
      if (endTime && timezone) {
        let endUtc = this.toUtcDateArray({ year, month: month + 1, day, time: endTime, timezone });
        // Handle midnight rollover in the same timezone
        if (endUtc && startTime) {
          const startUtc = event.start;
          const startDt = startUtc && startUtc.length === 5 ? DateTime.utc(...startUtc) : null;
          const endDt = DateTime.utc(...endUtc);
          if (startDt && endDt < startDt) {
            endUtc = this.toUtcDateArray({ year, month: month + 1, day, time: endTime, timezone, addDays: 1 });
          }
        }
        if (endUtc) {
          event.end = endUtc;
          event.endInputType = 'utc';
          event.endOutputType = 'utc';
        }
      } else if (duration) {
        event.duration = duration;
      } else if (startTime) {
        event.duration = { hours: 8 };
      } else {
        event.duration = { days: 1 };
      }
    } else {
      event.duration = duration;
    }

    return event;
  }

  /**
   * Build description for flight entries
   * @param {Object} entry - Roster entry
   * @returns {string} Description text
   */
  buildFlightDescription(entry) {
    let desc = `Duty: ${entry.dutyCode || 'Flight'}\n`;
    
    if (entry.service) {
      desc += `Flight(s): ${entry.service}\n`;
    }
    
    if (entry.passive) {
      desc += `Type: Passive (Positioning)\n`;
    }
    
    if (entry.signOn) {
      desc += `Sign On: ${entry.signOn}\n`;
    }
    
    if (entry.signOff) {
      desc += `Sign Off: ${entry.signOff}\n`;
    }
    
    if (entry.dutyHours) {
      desc += `Duty Hours: ${entry.dutyHours}\n`;
    }
    
    if (entry.creditHours) {
      desc += `Credit Hours: ${entry.creditHours}\n`;
    }

    // DPC60 pay rule: pay is max(credit, 60% of duty)
    if (entry.dutyType === 'FLIGHT' && entry.dutyHours) {
      const payLine = this.buildPayLine({ dutyHours: entry.dutyHours, creditHours: entry.creditHours });
      if (payLine) desc += `${payLine}\n`;
    }
    
    if (entry.port) {
      desc += `Port: ${entry.port}\n`;
    }
    
    return desc.trim();
  }

  /**
   * Parse time string to [hour, minute]
   * @param {string} timeStr - Time string like "0900" or "1545"
   * @returns {Array|null} [hour, minute] or null
   */
  parseTime(timeStr) {
    if (!timeStr) return null;
    
    // Remove any day indicators like +1
    timeStr = timeStr.replace(/\+\d+$/, '');
    
    if (timeStr.length === 4) {
      const hour = parseInt(timeStr.substring(0, 2));
      const minute = parseInt(timeStr.substring(2, 4));
      return [hour, minute];
    }
    
    return null;
  }
}

module.exports = ICSCalendarService;

/**
 * Tests for Qantas Roster Parser
 */

const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const fs = require('fs');
const path = require('path');

describe('QantasRosterParser', () => {
  let parser;
  let sampleRosterText;

  beforeAll(() => {
    parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-roster.txt');
    sampleRosterText = fs.readFileSync(samplePath, 'utf-8');
  });

  test('should parse employee information', () => {
    const roster = parser.parse(sampleRosterText);

    expect(roster.employee.name).toBe('DOE J');
    expect(roster.employee.staffNo).toBe('000000');
    expect(roster.employee.category).toBe('F/O-B737');
    expect(roster.employee.base).toBe('PER');
    expect(roster.employee.line).toBe('PLH');
  });

  test('should parse roster entries', () => {
    const roster = parser.parse(sampleRosterText);

    expect(roster.entries).toBeDefined();
    expect(roster.entries.length).toBeGreaterThan(0);
  });

  test('should identify D/O (Day Off) entries', () => {
    const roster = parser.parse(sampleRosterText);
    const dayOffEntries = roster.entries.filter(e => e.dutyType === 'DAY_OFF');

    expect(dayOffEntries.length).toBeGreaterThan(0);
    expect(dayOffEntries[0].dutyCode).toBe('D/O');
  });

  test('should identify AV as an Available Day', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/sample-webcis-roster.txt'),
      'utf-8'
    );
    const roster = parser.parse(text);
    const avEntries = roster.entries.filter(e => e.dutyCode === 'AV');

    expect(avEntries.length).toBeGreaterThan(0);
    avEntries.forEach(e => {
      expect(e.dutyType).toBe('AVAILABLE_DAY');
    });
  });

  test('should identify flight duty entries', () => {
    const roster = parser.parse(sampleRosterText);
    const flightEntries = roster.entries.filter(e => e.dutyType === 'FLIGHT');

    expect(flightEntries.length).toBeGreaterThan(0);
  });

  test('should parse flight entry with service number', () => {
    const roster = parser.parse(sampleRosterText);
    const flightEntry = roster.entries.find(e => e.service === 'QF940');

    expect(flightEntry).toBeDefined();
    expect(flightEntry.dutyCode).toBe('8026A4');
    expect(flightEntry.signOn).toBe('1650');
    expect(flightEntry.signOff).toBe('0012');
  });

  test('should identify reserve duty entries', () => {
    const roster = parser.parse(sampleRosterText);
    const reserveEntries = roster.entries.filter(e => e.dutyType === 'RESERVE');

    expect(reserveEntries.length).toBeGreaterThan(0);
    const reserveEntry = reserveEntries[0];
    expect(reserveEntry.dutyCode).toMatch(/^R\d+$/);
  });

  test('should parse reserve duties with 4:00 credit hours default', () => {
    const bp3735Path = path.join(__dirname, '../examples/roster-174423-bp-3735.txt');
    const bp3735Text = fs.readFileSync(bp3735Path, 'utf-8');
    const roster = parser.parse(bp3735Text);
    
    const reserveEntries = roster.entries.filter(e => e.dutyType === 'RESERVE');
    expect(reserveEntries.length).toBeGreaterThan(0);
    
    // All reserve duties should have 4:00 credit hours
    reserveEntries.forEach(entry => {
      expect(entry.creditHours).toBe('4:00');
      expect(entry.dutyHours).toBeDefined();
    });
  });

  test('should identify EP* (Emergency Procedures) entries', () => {
    const bp3735Path = path.join(__dirname, '../examples/roster-174423-bp-3735.txt');
    const bp3735Text = fs.readFileSync(bp3735Path, 'utf-8');
    const roster = parser.parse(bp3735Text);
    
    const epEntries = roster.entries.filter(e => e.dutyType === 'EMERGENCY_PROCEDURES');
    expect(epEntries.length).toBeGreaterThan(0);
    
    const ep1Entry = epEntries.find(e => e.dutyCode === 'EP1');
    expect(ep1Entry).toBeDefined();
    expect(ep1Entry.description).toBe('Emergency Procedures EP1');
    expect(ep1Entry.signOn).toBe('0850');
    expect(ep1Entry.signOff).toBe('1640');
    expect(ep1Entry.dutyHours).toBe('7:50');
    expect(ep1Entry.creditHours).toBe('4:00');
    expect(ep1Entry.code).toBe('AS20');
  });

  test('should identify personal leave days', () => {
    const roster = parser.parse(sampleRosterText);
    const planningEntries = roster.entries.filter(e => e.dutyType === 'PERSONAL_LEAVE');

    expect(planningEntries.length).toBeGreaterThan(0);
    expect(planningEntries[0].dutyCode).toBe('PLN');
  });

  test('should parse passive flights', () => {
    const roster = parser.parse(sampleRosterText);
    const passiveEntries = roster.entries.filter(e => e.passive === true);

    expect(passiveEntries.length).toBeGreaterThan(0);
  });

  test('should extract day and day of week', () => {
    const roster = parser.parse(sampleRosterText);
    const firstEntry = roster.entries[0];

    expect(firstEntry.day).toBeDefined();
    expect(firstEntry.dayOfWeek).toBeDefined();
    expect(typeof firstEntry.day).toBe('number');
  });

  test('should extract roster period start/end from header', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/sample-webcis-roster.txt'),
      'utf-8'
    );
    const roster = parser.parse(text);

    expect(roster.summary).toBeDefined();
    expect(roster.summary.periodStart).toEqual({ year: 2025, month: 11, day: 29 });
    expect(roster.summary.periodEnd).toEqual({ year: 2026, month: 0, day: 26 });

    const period = parser.getRosterPeriod(roster);
    expect(period).toEqual({ startMonth: 11, startYear: 2025, endMonth: 0, endYear: 2026 });
  });

  test('should extract flight legs from Pattern Details section', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/sample-webcis-roster.txt'),
      'utf-8'
    );
    const roster = parser.parse(text);

    expect(Array.isArray(roster.flights)).toBe(true);
    expect(roster.flights.length).toBeGreaterThan(0);

    // Known flight from Pattern Details
    expect(roster.flights.some(f => f.flightNumber === 'QF940')).toBe(true);
    const first = roster.flights[0];
    expect(first).toHaveProperty('departPort');
    expect(first).toHaveProperty('arrivePort');
    expect(first).toHaveProperty('departTime');
    expect(first).toHaveProperty('arriveTime');
    expect(first).toHaveProperty('year');
    expect(first).toHaveProperty('month');
    expect(first).toHaveProperty('day');
  });

  test('should prefix QF for numeric flight numbers', () => {
    expect(parser.normalizeFlightNumber('775')).toBe('QF775');
    expect(parser.normalizeFlightNumber('QF775')).toBe('QF775');
    expect(parser.normalizeService('940')).toBe('QF940');
    expect(parser.normalizeService('P940')).toBe('QF940');
    expect(parser.normalizeService('940/941')).toBe('QF940/QF941');
  });

  test('should anchor BP 3695 to July 2025 period start when available', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/roster-174423-bp-3695.txt'),
      'utf-8'
    );
    const roster = parser.parse(text);

    expect(roster.summary).toBeDefined();
    expect(roster.summary.bidPeriod).toBe('3695');
    expect(roster.summary.periodStart).toEqual({ year: 2025, month: 6, day: 14 });
    expect(roster.summary.periodEnd).toEqual({ year: 2025, month: 7, day: 11 });

    const period = parser.getRosterPeriod(roster);
    expect(period).toEqual({ startMonth: 6, startYear: 2025, endMonth: 7, endYear: 2025 });
  });

  test('should infer period start from Pattern Details when header period line is missing (BP 3695)', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/roster-174423-bp-3695.txt'),
      'utf-8'
    );

    // Simulate rosters that omit the "Available Date/Time this (next) BP" line.
    const withoutPeriodLine = text
      .split(/\r?\n/)
      .filter(l => !(l.includes('Available Date/Time this') && l.includes('BP')))
      .join('\n');

    const roster = parser.parse(withoutPeriodLine);
    expect(roster.summary).toBeDefined();
    expect(roster.summary.periodStart).toBeUndefined();

    // Even without the header period line, Pattern Details includes DATED tokens (e.g. 15Jul25)
    // so we should infer the correct month/year rather than defaulting to "now".
    const period = parser.getRosterPeriod(roster);
    expect(period.startMonth).toBe(6); // July
    expect(period.startYear).toBe(2025);
  });

  describe('Duty Value Calculations', () => {
    test('should convert credit hours to decimal hours', () => {
      expect(QantasRosterParser.creditHoursToDecimal('7:30')).toBe(7.5);
      expect(QantasRosterParser.creditHoursToDecimal('8:00')).toBe(8);
      expect(QantasRosterParser.creditHoursToDecimal('10:15')).toBe(10.25);
      expect(QantasRosterParser.creditHoursToDecimal('0:30')).toBe(0.5);
      expect(QantasRosterParser.creditHoursToDecimal('12:45')).toBe(12.75);
    });

    test('should return null for invalid credit hours', () => {
      expect(QantasRosterParser.creditHoursToDecimal(null)).toBe(null);
      expect(QantasRosterParser.creditHoursToDecimal('')).toBe(null);
      expect(QantasRosterParser.creditHoursToDecimal('invalid')).toBe(null);
      expect(QantasRosterParser.creditHoursToDecimal('7:60')).toBe(null);
      expect(QantasRosterParser.creditHoursToDecimal('25:00')).toBe(null);
    });

    test('should calculate duty value from credit hours and pay rate', () => {
      expect(QantasRosterParser.calculateDutyValue('7:30', 100)).toBe(750);
      expect(QantasRosterParser.calculateDutyValue('8:00', 150)).toBe(1200);
      expect(QantasRosterParser.calculateDutyValue('10:15', 120)).toBe(1230);
      expect(QantasRosterParser.calculateDutyValue('0:30', 100)).toBe(50);
    });

    test('should return null for invalid inputs in calculateDutyValue', () => {
      expect(QantasRosterParser.calculateDutyValue('invalid', 100)).toBe(null);
      expect(QantasRosterParser.calculateDutyValue('7:30', -50)).toBe(null);
      expect(QantasRosterParser.calculateDutyValue('7:30', NaN)).toBe(null);
      expect(QantasRosterParser.calculateDutyValue(null, 100)).toBe(null);
    });

    test('should enrich roster entries with duty values', () => {
      const roster = parser.parse(sampleRosterText);
      const enrichedRoster = QantasRosterParser.enrichRosterWithDutyValues(roster, 150);

      expect(enrichedRoster.summary.payRate).toBe(150);
      expect(enrichedRoster.summary.totalDutyValue).toBeDefined();
      expect(enrichedRoster.summary.totalDutyValue).toBeGreaterThan(0);

      // Check that entries with creditHours have dutyValue
      const entriesWithCredit = enrichedRoster.entries.filter(e => e.creditHours);
      expect(entriesWithCredit.length).toBeGreaterThan(0);
      
      entriesWithCredit.forEach(entry => {
        expect(entry.dutyValue).toBeDefined();
        expect(entry.dutyValue).toBeGreaterThan(0);
      });
    });

    test('should calculate correct total duty value', () => {
      const mockRoster = {
        employee: { staffNo: '123456' },
        entries: [
          { day: 1, dutyCode: '8001A1', creditHours: '7:30' },
          { day: 2, dutyCode: '8002A1', creditHours: '8:00' },
          { day: 3, dutyCode: 'D/O' }, // No credit hours
          { day: 4, dutyCode: '8003A1', creditHours: '6:15' }
        ],
        summary: {}
      };

      const enriched = QantasRosterParser.enrichRosterWithDutyValues(mockRoster, 100);
      
      // 7.5 * 100 = 750
      // 8.0 * 100 = 800
      // 6.25 * 100 = 625
      // Total = 2175
      expect(enriched.summary.totalDutyValue).toBe(2175);
    });

    test('should handle roster with no credit hours gracefully', () => {
      const mockRoster = {
        employee: { staffNo: '123456' },
        entries: [
          { day: 1, dutyCode: 'D/O' },
          { day: 2, dutyCode: 'AV' }
        ],
        summary: {}
      };

      const enriched = QantasRosterParser.enrichRosterWithDutyValues(mockRoster, 100);
      expect(enriched.summary.totalDutyValue).toBe(0);
    });
  });});
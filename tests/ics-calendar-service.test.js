/**
 * Tests for ICS Calendar Service
 */

const ICSCalendarService = require('../src/services/ics-calendar-service');
const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const fs = require('fs');
const path = require('path');

describe('ICSCalendarService', () => {
  let icsService;
  let roster;

  beforeAll(() => {
    icsService = new ICSCalendarService();
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-roster.txt');
    const sampleRosterText = fs.readFileSync(samplePath, 'utf-8');
    roster = parser.parse(sampleRosterText);
  });

  test('should generate ICS calendar', async () => {
    const icsData = await icsService.generateICS(roster);

    expect(icsData).toBeDefined();
    expect(typeof icsData).toBe('string');
    expect(icsData).toContain('BEGIN:VCALENDAR');
    expect(icsData).toContain('END:VCALENDAR');
  });

  test('should merge multiple rosters into a single ICS (without dropping prior events)', async () => {
    const parser = new QantasRosterParser();
    const r1 = parser.parse(fs.readFileSync(path.join(__dirname, '../examples/sample-roster.txt'), 'utf-8'));
    const r2 = parser.parse(fs.readFileSync(path.join(__dirname, '../examples/sample-webcis-roster.txt'), 'utf-8'));

    const ics1 = await icsService.generateICS(r1);
    const icsCombined = await icsService.generateICSForRosters([r1, r2]);

    const countEvents = (icsText) => (String(icsText).match(/BEGIN:VEVENT/g) || []).length;

    expect(countEvents(icsCombined)).toBeGreaterThan(countEvents(ics1));
    expect(icsCombined).toContain('BEGIN:VCALENDAR');
    expect(icsCombined).toContain('END:VCALENDAR');

    // Should include at least one known flight from Pattern Details
    expect(icsCombined).toContain('QF940 PER-BNE');
  });

  test('should deduplicate events by UID when the same roster is merged twice', async () => {
    const parser = new QantasRosterParser();
    const r1 = parser.parse(fs.readFileSync(path.join(__dirname, '../examples/sample-webcis-roster.txt'), 'utf-8'));

    const eventsOnce = icsService.convertRostersToEvents([r1]);
    const eventsTwice = icsService.convertRostersToEvents([r1, r1]);

    expect(eventsTwice.length).toEqual(eventsOnce.length);
  });

  test('should create events from roster entries', () => {
    const events = icsService.convertRosterToEvents(roster);

    expect(events).toBeDefined();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  test('should create all-day events for D/O days', () => {
    const events = icsService.convertRosterToEvents(roster);
    const dayOffEvents = events.filter(e => e.title === 'Day Off');

    expect(dayOffEvents.length).toBeGreaterThan(0);
    dayOffEvents.forEach(e => {
      expect(e.duration).toEqual({ days: 1 });
      expect(e.start.length).toBe(3);
    });
  });

  test('should create events for flight duties', () => {
    const events = icsService.convertRosterToEvents(roster);
    const dutyEvents = events.filter(e => e.title && e.title.includes('Duty'));

    expect(dutyEvents.length).toBeGreaterThan(0);
  });

  test('should create per-flight events from Pattern Details', () => {
    const parser = new QantasRosterParser();
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/sample-webcis-roster.txt'),
      'utf-8'
    );
    const parsed = parser.parse(text);

    const events = icsService.convertRosterToEvents(parsed);
    const flightEvents = events.filter(e => e.title && String(e.title).includes(' PER-'));

    expect(flightEvents.length).toBeGreaterThan(0);
    // Should include a known flight number from the sample roster Pattern Details
    expect(flightEvents.some(e => String(e.title).includes('QF940 PER-BNE'))).toBe(true);
  });

  test('should not include award codes in descriptions', () => {
    const events = icsService.convertRosterToEvents(roster);
    // AW01 etc should not appear anywhere in ICS descriptions
    expect(events.some(e => String(e.description || '').includes('AW01'))).toBe(false);
    expect(events.some(e => String(e.description || '').includes('Code:'))).toBe(false);
  });

  test('should add DPC60 pay indication to flight duty descriptions', () => {
    const descCreditWins = icsService.buildFlightDescription({
      dutyType: 'FLIGHT',
      dutyCode: 'TEST',
      dutyHours: '10:00',
      creditHours: '07:00'
    });

    expect(descCreditWins).toContain('Credit: 7:00 (DPC60 min 6:00)');

    const descDpcWins = icsService.buildFlightDescription({
      dutyType: 'FLIGHT',
      dutyCode: 'TEST',
      dutyHours: '10:00',
      creditHours: '05:00'
    });

    expect(descDpcWins).toContain('Credit: 6:00 (DPC60 min 6:00)');
  });

  test('should add DPC60 pay indication to Pattern Details duty events', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const events = icsService.convertRosterToEvents(parsed);
    const dutyEvents = events.filter(e => e.title === 'Duty: 8130');
    expect(dutyEvents.length).toBeGreaterThan(0);

    dutyEvents.forEach(e => {
      expect(String(e.description || '')).toContain('Credit:');
      expect(String(e.description || '')).toContain('DPC60 min');
    });
  });

  test('should parse time correctly', () => {
    const time = icsService.parseTime('1650');
    expect(time).toEqual([16, 50]);

    const time2 = icsService.parseTime('0012');
    expect(time2).toEqual([0, 12]);
  });

  test('should handle time with day indicator', () => {
    const time = icsService.parseTime('0012+1');
    expect(time).toEqual([0, 12]);
  });

  test('should create event with proper structure', () => {
    const events = icsService.convertRosterToEvents(roster);
    const event = events[0];

    expect(event).toHaveProperty('title');
    expect(event).toHaveProperty('description');
    expect(event).toHaveProperty('start');
    expect(event).toHaveProperty('uid');
    expect(Array.isArray(event.start)).toBe(true);
  });

  test('should not emit undefined titles for blank Duty(Role) rows', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const events = icsService.convertRosterToEvents(parsed);
    const badEvents = events.filter(e =>
      String(e.title || '').includes('undefined') ||
      String(e.description || '').includes('undefined')
    );

    expect(badEvents.length).toBe(0);
  });

  test('should emit multiple duty events for a multi-duty pattern', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const events = icsService.convertRosterToEvents(parsed);

    const duty8130 = events.filter(e => e.title === 'Duty: 8130');
    expect(duty8130.length).toBe(2);
    duty8130.forEach(e => {
      expect(Array.isArray(e.start)).toBe(true);
      expect(e.start.length).toBe(5);
    });
  });

  test('should assign correct year/month for Dec→Jan rosters', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const events = icsService.convertRosterToEvents(parsed);
    const firstFlight = events.find(e => String(e.title || '').includes('8001A1'));

    expect(firstFlight).toBeDefined();
    // Times are emitted as UTC for cross-timezone correctness.
    // 29 Dec 2025 06:15 in Perth = 28 Dec 2025 22:15Z
    expect(firstFlight.start).toEqual([2025, 12, 28, 22, 15]);
  });

  test('should create all-day Available Day events for AV', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const events = icsService.convertRosterToEvents(parsed);
    // The sample roster has AV on 31 (Dec 31, 2025)
    const available = events.find(e => e.title === 'Available Day' && e.start.slice(0, 3).join('-') === '2025-12-31');

    expect(available).toBeDefined();
    expect(available.duration).toEqual({ days: 1 });
  });
});

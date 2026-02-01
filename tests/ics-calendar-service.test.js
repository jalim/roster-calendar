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

    expect(descCreditWins).toContain('Pay: 7:00 (credit; DPC60 min 6:00)');

    const descDpcWins = icsService.buildFlightDescription({
      dutyType: 'FLIGHT',
      dutyCode: 'TEST',
      dutyHours: '10:00',
      creditHours: '05:00'
    });

    expect(descDpcWins).toContain('Pay: 6:00 (DPC60; roster credit 5:00)');
  });

  test('DPC60 minimum should be 60% of duty (08 Sun in provided roster)', () => {
    const parser = new QantasRosterParser();
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/webCisRoster_174423_01022026.txt'),
      'utf-8'
    );
    const parsed = parser.parse(text);

    const entry = parsed.entries.find(e => e.day === 8 && e.dayOfWeek === 'Sun');
    expect(entry).toBeDefined();
    expect(entry.dutyHours).toBe('9:20');
    expect(entry.creditHours).toBe('6:45');

    const payLine = icsService.buildPayLine({ dutyHours: entry.dutyHours, creditHours: entry.creditHours });
    expect(payLine).toBe('Pay: 6:45 (credit; DPC60 min 5:36)');
  });

  test('Pattern Details duty event should use roster credit for continuation days (08 Sun 8130)', () => {
    const parser = new QantasRosterParser();
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/webCisRoster_174423_01022026.txt'),
      'utf-8'
    );
    const parsed = parser.parse(text);

    const events = icsService.convertRosterToEvents(parsed);
    const dutyEvents = events.filter(e => e.title === 'Duty: 8130');
    expect(dutyEvents.length).toBeGreaterThan(0);

    const target = dutyEvents.find(e =>
      String(e.description || '').includes('Report: SYD 1040') &&
      String(e.description || '').includes('Release: PER 1700') &&
      String(e.description || '').includes('QF516 SYD-BNE') &&
      String(e.description || '').includes('QF937 BNE-PER')
    );

    expect(target).toBeDefined();
    expect(String(target.description || '')).toContain('Pay: 6:45 (credit; DPC60 min 5:36)');
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
      expect(String(e.description || '')).toContain('Pay:');
      expect(String(e.description || '')).toContain('DPC60');
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

  test('should create an all-day Pattern event spanning multi-day trips away from base', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const events = icsService.convertRosterToEvents(parsed);
    const pattern = events.find(e => e.title === 'Pattern: 8130');

    expect(pattern).toBeDefined();
    expect(Array.isArray(pattern.start)).toBe(true);
    expect(pattern.start.length).toBe(3);
    expect(Array.isArray(pattern.end)).toBe(true);
    expect(pattern.end.length).toBe(3);
    expect(String(pattern.description || '')).toContain('Away from base: PER');

    // End should be exclusive and after start
    const startMs = Date.UTC(pattern.start[0], pattern.start[1] - 1, pattern.start[2]);
    const endMs = Date.UTC(pattern.end[0], pattern.end[1] - 1, pattern.end[2]);
    expect(endMs).toBeGreaterThan(startMs);
  });

  test('should not create Pattern all-day events for single-day/single-duty patterns', () => {
    const parser = new QantasRosterParser();
    const samplePath = path.join(__dirname, '../examples/sample-webcis-roster.txt');
    const rosterText = fs.readFileSync(samplePath, 'utf-8');
    const parsed = parser.parse(rosterText);

    const counts = new Map();
    for (const p of (parsed.dutyPatterns || [])) {
      if (!p || !p.dutyCode) continue;
      const code = String(p.dutyCode).trim();
      counts.set(code, (counts.get(code) || 0) + 1);
    }

    const singleCode = Array.from(counts.entries()).find(([, n]) => n === 1);
    expect(singleCode).toBeDefined();

    const [code] = singleCode;
    const events = icsService.convertRosterToEvents(parsed);
    const pattern = events.find(e => e.title === `Pattern: ${code}`);

    expect(pattern).toBeUndefined();
  });

  test('Pattern title should include slip (overnight) ports', () => {
    // Create a synthetic 2-day pattern with an overnight slip in SYD.
    // Day 1: PER ... SYD (release in SYD)
    // Day 2: SYD ... PER (report in SYD)
    const employee = { name: 'TEST', base: 'PER' };
    const dutyPatterns = [
      {
        dutyCode: '9999',
        dated: { year: 2026, month: 0, day: 5 },
        reportTime: '0800',
        reportPort: 'PER',
        releaseTime: '2200',
        releasePort: 'SYD',
        legs: [
          {
            year: 2026,
            month: 0,
            day: 5,
            flightNumber: 'QF001',
            passive: false,
            departPort: 'PER',
            departTime: '0900',
            arrivePort: 'SYD',
            arriveTime: '2100'
          }
        ]
      },
      {
        dutyCode: '9999',
        dated: { year: 2026, month: 0, day: 6 },
        reportTime: '0700',
        reportPort: 'SYD',
        releaseTime: '1700',
        releasePort: 'PER',
        legs: [
          {
            year: 2026,
            month: 0,
            day: 6,
            flightNumber: 'QF002',
            passive: false,
            departPort: 'SYD',
            departTime: '0800',
            arrivePort: 'PER',
            arriveTime: '1600'
          }
        ]
      }
    ];

    const events = icsService.createAllDayPatternEventsFromDutyPatterns(dutyPatterns, employee);
    const pattern = events.find(e => e.title && e.title.startsWith('Pattern: 9999'));

    expect(pattern).toBeDefined();
    expect(pattern.title).toBe('Pattern: 9999 SYD');
  });

  test('should detect Long Slip credit when slip exceeds 30 hours (PLFP02A1 in provided roster)', () => {
    const parser = new QantasRosterParser();
    const text = fs.readFileSync(
      path.join(__dirname, '../examples/webCisRoster_174423_01022026.txt'),
      'utf-8'
    );
    const parsed = parser.parse(text);

    const events = icsService.convertRosterToEvents(parsed);
    const pattern = events.find(e => String(e.title || '').startsWith('Pattern: PLFP02A1'));

    expect(pattern).toBeDefined();
    expect(String(pattern.title)).toContain('SYD');
    expect(String(pattern.title)).toContain('(Long Slip)');

    expect(String(pattern.description || '')).toContain('Slip ports: SYD');
    expect(String(pattern.description || '')).toContain('Long slip credit: SYD 45:10');
  });

  test('should not detect Long Slip credit at exactly 30:00 (strictly greater required)', () => {
    const employee = { name: 'TEST', base: 'PER' };
    const dutyPatterns = [
      {
        dutyCode: '3000',
        dated: { year: 2026, month: 0, day: 5 },
        reportTime: '0600',
        reportPort: 'PER',
        releaseTime: '0800',
        releasePort: 'SYD',
        legs: [
          {
            year: 2026,
            month: 0,
            day: 5,
            flightNumber: 'QF101',
            passive: false,
            departPort: 'PER',
            departTime: '0700',
            arrivePort: 'SYD',
            arriveTime: '0800'
          }
        ]
      },
      {
        dutyCode: '3000',
        dated: { year: 2026, month: 0, day: 6 },
        reportTime: '1400',
        reportPort: 'SYD',
        releaseTime: '1800',
        releasePort: 'PER',
        legs: [
          {
            year: 2026,
            month: 0,
            day: 6,
            flightNumber: 'QF102',
            passive: false,
            departPort: 'SYD',
            departTime: '1500',
            arrivePort: 'PER',
            arriveTime: '1800'
          }
        ]
      }
    ];

    const events = icsService.createAllDayPatternEventsFromDutyPatterns(dutyPatterns, employee);
    const pattern = events.find(e => String(e.title || '').startsWith('Pattern: 3000'));
    expect(pattern).toBeDefined();
    expect(String(pattern.title)).toContain('SYD');
    expect(String(pattern.title)).not.toContain('(Long Slip)');
    expect(String(pattern.description || '')).not.toContain('Long slip credit');
  });
});

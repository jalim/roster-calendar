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

  test('should create events from roster entries', () => {
    const events = icsService.convertRosterToEvents(roster);

    expect(events).toBeDefined();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  test('should not create events for D/O days', () => {
    const events = icsService.convertRosterToEvents(roster);
    const dayOffEvents = events.filter(e => e.title && e.title.includes('D/O'));

    expect(dayOffEvents.length).toBe(0);
  });

  test('should create events for flight duties', () => {
    const events = icsService.convertRosterToEvents(roster);
    const flightEvents = events.filter(e => e.title && e.title.includes('Flight'));

    expect(flightEvents.length).toBeGreaterThan(0);
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
});

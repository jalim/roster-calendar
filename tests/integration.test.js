/**
 * Integration test for the complete roster-to-ICS workflow
 */

const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const ICSCalendarService = require('../src/services/ics-calendar-service');
const TimezoneService = require('../src/services/timezone-service');
const fs = require('fs');
const path = require('path');

describe('Roster to ICS Integration', () => {
  let parser;
  let icsService;
  let timezoneService;
  let sampleRosterText;

  beforeAll(() => {
    parser = new QantasRosterParser();
    icsService = new ICSCalendarService();
    timezoneService = new TimezoneService();
    const samplePath = path.join(__dirname, '../examples/sample-roster.txt');
    sampleRosterText = fs.readFileSync(samplePath, 'utf-8');
  });

  test('complete workflow: parse roster and generate ICS', async () => {
    // Parse the roster
    const roster = parser.parse(sampleRosterText);
    
    expect(roster).toBeDefined();
    expect(roster.employee).toBeDefined();
    expect(roster.entries.length).toBeGreaterThan(0);

    // Generate ICS calendar
    const icsData = await icsService.generateICS(roster);
    
    expect(icsData).toBeDefined();
    expect(typeof icsData).toBe('string');
    expect(icsData).toContain('BEGIN:VCALENDAR');
    expect(icsData).toContain('END:VCALENDAR');
    expect(icsData).toContain('BEGIN:VEVENT');
  });

  test('ICS events should include timezone information', async () => {
    const roster = parser.parse(sampleRosterText);
    const icsData = await icsService.generateICS(roster);
    
    // Check that timezone info is in the descriptions
    expect(icsData).toContain('Timezone: Australia/');
  });

  test('flight events should have correct timezone based on port', async () => {
    const roster = parser.parse(sampleRosterText);
    const events = icsService.convertRosterToEvents(roster);
    
    // Find event with BNE port
    const bneEvent = events.find(e => 
      e.description && e.description.includes('Port: BNE')
    );
    
    if (bneEvent) {
      expect(bneEvent.description).toContain('Timezone: Australia/Brisbane');
    }
    
    // Find event with SYD port
    const sydEvent = events.find(e => 
      e.description && e.description.includes('Port: SYD')
    );
    
    if (sydEvent) {
      expect(sydEvent.description).toContain('Timezone: Australia/Sydney');
    }
  });

  test('events without port should use employee base timezone', async () => {
    const roster = parser.parse(sampleRosterText);
    const events = icsService.convertRosterToEvents(roster);
    
    // Find planning day events (no port specified)
    const planningEvents = events.filter(e => 
      e.title && e.title.includes('Planning')
    );
    
    expect(planningEvents.length).toBeGreaterThan(0);
    
    // Should use employee base (PER)
    planningEvents.forEach(event => {
      expect(event.description).toContain('Timezone: Australia/Perth');
    });
  });

  test('passive flights should be correctly identified', async () => {
    const roster = parser.parse(sampleRosterText);
    const passiveEntries = roster.entries.filter(e => e.passive === true);
    
    expect(passiveEntries.length).toBeGreaterThan(0);
    
    const events = icsService.convertRosterToEvents(roster);
    const passiveEvents = events.filter(e => 
      e.description && e.description.includes('Passive')
    );
    
    expect(passiveEvents.length).toBeGreaterThan(0);
  });

  test('day off entries should not appear in calendar', async () => {
    const roster = parser.parse(sampleRosterText);
    const dayOffEntries = roster.entries.filter(e => e.dutyType === 'OFF');
    
    // There should be D/O entries in the roster
    expect(dayOffEntries.length).toBeGreaterThan(0);
    
    const events = icsService.convertRosterToEvents(roster);
    const dayOffEvents = events.filter(e => 
      e.title && e.title.toLowerCase().includes('day off')
    );
    
    // But they should not appear in the events
    expect(dayOffEvents.length).toBe(0);
  });
});

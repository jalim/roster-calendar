/**
 * Tests for public (redacted) calendar generation
 */

const ICSCalendarService = require('../src/services/ics-calendar-service');
const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const fs = require('fs');
const path = require('path');

describe('Public Calendar Service', () => {
  let icsService;
  let parser;
  let sampleRoster;

  beforeEach(() => {
    icsService = new ICSCalendarService();
    parser = new QantasRosterParser();
    
    const sampleText = fs.readFileSync(
      path.join(__dirname, '../examples/sample-roster.txt'),
      'utf-8'
    );
    sampleRoster = parser.parse(sampleText);
  });

  describe('isDutyTypeBusy', () => {
    test('should mark D/O (Day Off) as free', () => {
      expect(icsService.isDutyTypeBusy('DAY_OFF')).toBe(false);
    });

    test('should mark AV (Available Day) as free', () => {
      expect(icsService.isDutyTypeBusy('AVAILABLE_DAY')).toBe(false);
    });

    test('should mark Annual Leave as free', () => {
      expect(icsService.isDutyTypeBusy('ANNUAL_LEAVE')).toBe(false);
    });

    test('should mark Blank Day as free', () => {
      expect(icsService.isDutyTypeBusy('BLANK_DAY')).toBe(false);
    });

    test('should mark Reserve (R4/R5) as busy', () => {
      expect(icsService.isDutyTypeBusy('RESERVE')).toBe(true);
    });

    test('should mark Flight duty as busy', () => {
      expect(icsService.isDutyTypeBusy('FLIGHT')).toBe(true);
    });

    test('should mark Simulator as busy', () => {
      expect(icsService.isDutyTypeBusy('SIMULATOR')).toBe(true);
    });

    test('should mark Emergency Procedures as busy', () => {
      expect(icsService.isDutyTypeBusy('EMERGENCY_PROCEDURES')).toBe(true);
    });

    test('should mark Personal Leave as busy', () => {
      expect(icsService.isDutyTypeBusy('PERSONAL_LEAVE')).toBe(true);
    });
  });

  describe('convertRosterToPublicEvents', () => {
    test('should convert roster to public events', () => {
      const events = icsService.convertRosterToPublicEvents(sampleRoster);
      
      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
    });

    test('should create "Free" events for D/O entries', () => {
      const events = icsService.convertRosterToPublicEvents(sampleRoster);
      const dayOffEvents = events.filter(e => e.title === 'Free');
      
      expect(dayOffEvents.length).toBeGreaterThan(0);
      dayOffEvents.forEach(e => {
        expect(e.description).toBe('Available');
        expect(e.busyStatus).toBe('FREE');
        expect(e.transp).toBe('TRANSPARENT');
      });
    });

    test('should create "Busy" events for reserve duties', () => {
      const events = icsService.convertRosterToPublicEvents(sampleRoster);
      const reserveEntry = sampleRoster.entries.find(e => e.dutyType === 'RESERVE');
      
      if (reserveEntry) {
        // Find the corresponding event by checking the day
        const busyEvents = events.filter(e => e.title === 'Busy');
        expect(busyEvents.length).toBeGreaterThan(0);
        
        busyEvents.forEach(e => {
          expect(e.description).toBe('Unavailable');
          expect(e.busyStatus).toBe('BUSY');
          expect(e.transp).toBe('OPAQUE');
        });
      }
    });

    test('should create "Busy" events for flight duties', () => {
      const events = icsService.convertRosterToPublicEvents(sampleRoster);
      const flightEntry = sampleRoster.entries.find(e => e.dutyType === 'FLIGHT');
      
      if (flightEntry) {
        const busyEvents = events.filter(e => e.title === 'Busy');
        expect(busyEvents.length).toBeGreaterThan(0);
      }
    });

    test('should not include sensitive flight information in public events', () => {
      const events = icsService.convertRosterToPublicEvents(sampleRoster);
      
      events.forEach(e => {
        // Should not contain flight numbers, duty codes, etc.
        expect(e.title).not.toMatch(/\d{3,4}/); // No flight numbers
        expect(e.title).not.toMatch(/QF|R[45]/); // No specific codes
        expect(e.description).not.toContain('Flight');
        expect(e.description).not.toContain('Duty');
        expect(e.description).not.toContain('Reserve');
        
        // Should only be "Busy"/"Free" or "Unavailable"/"Available"
        expect(['Busy', 'Free']).toContain(e.title);
        expect(['Unavailable', 'Available']).toContain(e.description);
      });
    });

    test('should preserve timing information for busy events', () => {
      const events = icsService.convertRosterToPublicEvents(sampleRoster);
      const flightEntry = sampleRoster.entries.find(e => e.dutyType === 'FLIGHT' && e.signOn && e.signOff);
      
      if (flightEntry) {
        // There should be timed busy events (not all-day)
        const timedBusyEvents = events.filter(e => 
          e.title === 'Busy' && e.start && e.start.length > 3
        );
        
        // At least some busy events should have time information
        expect(timedBusyEvents.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generatePublicICSForRosters', () => {
    test('should generate valid ICS format', async () => {
      const icsData = await icsService.generatePublicICSForRosters([sampleRoster]);
      
      expect(icsData).toBeDefined();
      expect(typeof icsData).toBe('string');
      expect(icsData).toContain('BEGIN:VCALENDAR');
      expect(icsData).toContain('END:VCALENDAR');
      expect(icsData).toContain('BEGIN:VEVENT');
      expect(icsData).toContain('END:VEVENT');
    });

    test('should contain only generic titles in ICS output', async () => {
      const icsData = await icsService.generatePublicICSForRosters([sampleRoster]);
      
      // Should contain "Busy" or "Free"
      expect(icsData).toMatch(/SUMMARY:(Busy|Free)/);
      
      // Should NOT contain sensitive information
      expect(icsData).not.toContain('Flight');
      expect(icsData).not.toContain('QF');
      expect(icsData).not.toMatch(/SUMMARY:.*\d{4}A\d/); // No duty codes like 8001A1
      expect(icsData).not.toContain('Reserve Duty');
    });

    test('should handle multiple rosters', async () => {
      const bp3735Text = fs.readFileSync(
        path.join(__dirname, '../examples/roster-174423-bp-3735.txt'),
        'utf-8'
      );
      const roster2 = parser.parse(bp3735Text);
      
      const icsData = await icsService.generatePublicICSForRosters([sampleRoster, roster2]);
      
      expect(icsData).toBeDefined();
      expect(icsData).toContain('BEGIN:VCALENDAR');
      
      // Should have merged events from both rosters
      const eventCount = (icsData.match(/BEGIN:VEVENT/g) || []).length;
      expect(eventCount).toBeGreaterThan(0);
    });
  });

  describe('createPublicEventFromEntry', () => {
    test('should create free event for Day Off', () => {
      const entry = {
        day: 1,
        dutyType: 'DAY_OFF',
        dutyCode: 'D/O'
      };
      
      const event = icsService.createPublicEventFromEntry(entry, 0, 2026, { name: 'Test Pilot' });
      
      expect(event).toBeDefined();
      expect(event.title).toBe('Free');
      expect(event.description).toBe('Available');
      expect(event.busyStatus).toBe('FREE');
      expect(event.transp).toBe('TRANSPARENT');
      expect(event.duration).toEqual({ days: 1 });
    });

    test('should create busy event for Reserve duty with times', () => {
      const entry = {
        day: 15,
        dutyType: 'RESERVE',
        dutyCode: 'R5',
        signOn: '0501',
        signOff: '1700'
      };
      
      const event = icsService.createPublicEventFromEntry(entry, 1, 2026, { name: 'Test Pilot' });
      
      expect(event).toBeDefined();
      expect(event.title).toBe('Busy');
      expect(event.description).toBe('Unavailable');
      expect(event.busyStatus).toBe('BUSY');
      expect(event.transp).toBe('OPAQUE');
      
      // Should have time information
      expect(event.start.length).toBe(5); // [year, month, day, hour, minute]
      expect(event.start[3]).toBe(5);  // 05:01
      expect(event.start[4]).toBe(1);
    });

    test('should create busy event for Flight duty', () => {
      const entry = {
        day: 5,
        dutyType: 'FLIGHT',
        dutyCode: '8026A4',
        service: 'QF940',
        signOn: '1650',
        signOff: '0012'
      };
      
      const event = icsService.createPublicEventFromEntry(entry, 1, 2026, { name: 'Test Pilot' });
      
      expect(event).toBeDefined();
      expect(event.title).toBe('Busy');
      expect(event.description).toBe('Unavailable');
      expect(event.busyStatus).toBe('BUSY');
      expect(event.transp).toBe('OPAQUE');
    });

    test('should handle midnight rollover for busy events', () => {
      const entry = {
        day: 5,
        dutyType: 'FLIGHT',
        signOn: '1650',  // 16:50
        signOff: '0012'  // 00:12 next day
      };
      
      const event = icsService.createPublicEventFromEntry(entry, 1, 2026, { name: 'Test Pilot' });
      
      expect(event).toBeDefined();
      expect(event.end).toBeDefined();
      
      // End should be next day
      const startDay = event.start[2];
      const endDay = event.end[2];
      expect(endDay).toBe(startDay + 1);
    });
  });
});

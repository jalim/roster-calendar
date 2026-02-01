describe('roster-store', () => {
  test('ingestRosterText stores first roster and deduplicates same text', () => {
    jest.resetModules();
    const rosterStore = require('../src/services/roster-store');
    const fs = require('fs');
    const path = require('path');

    const rosterText = fs.readFileSync(
      path.join(__dirname, '../examples/sample-roster.txt'),
      'utf8'
    );

    const first = rosterStore.ingestRosterText(rosterText);
    expect(first).toBeDefined();
    expect(first.rosterId).toBeTruthy();
    expect(first.isNew).toBe(true);
    expect(first.previousRoster).toBeNull();

    const second = rosterStore.ingestRosterText(rosterText);
    expect(second.rosterId).toEqual(first.rosterId);
    expect(second.isNew).toBe(false);
    expect(second.previousRoster).toBeNull();

    const bucket = rosterStore.getRosterBucket(first.rosterId);
    expect(bucket).toBeDefined();
    expect(Array.isArray(bucket.rosters)).toBe(true);
    expect(bucket.rosters.length).toBe(1);
  });

  test('ingestRosterText replaces existing roster for the same period (roster update)', async () => {
    jest.resetModules();
    const rosterStore = require('../src/services/roster-store');
    const ICSCalendarService = require('../src/services/ics-calendar-service');
    const fs = require('fs');
    const path = require('path');

    const originalText = fs.readFileSync(
      path.join(__dirname, '../examples/sample-webcis-roster.txt'),
      'utf8'
    );

    // Create an "updated" roster for the same bid period by changing a flight number.
    // Keep the period start/end line unchanged so this is a true update.
    const updatedText = originalText
      .replace('940/950', '940/951')
      .replace('29Dec       950  ', '29Dec       951  ');

    const first = rosterStore.ingestRosterText(originalText);
    expect(first.isNew).toBe(true);

    const second = rosterStore.ingestRosterText(updatedText);
    expect(second.isNew).toBe(true);
    expect(second.updated).toBe(true);
    expect(second.rosterId).toEqual(first.rosterId);
    expect(second.previousRoster).toBeDefined();

    // Previous roster should still have the old flight number.
    const prevFirstEntry = second.previousRoster.entries[0];
    expect(prevFirstEntry.service).toContain('QF950');

    const bucket = rosterStore.getRosterBucket(first.rosterId);
    expect(bucket).toBeDefined();
    expect(bucket.rosters.length).toBe(1);

    // Stored roster should reflect the update (main table service gets normalized to QFxxx/QFyyy).
    const firstEntry = bucket.rosters[0].entries[0];
    expect(firstEntry.service).toContain('QF951');

    // ICS output should include the updated flight number and not the old one.
    const icsService = new ICSCalendarService();
    const icsData = await icsService.generateICSForRosters(bucket.rosters);
    expect(icsData).toContain('QF951');
    expect(icsData).not.toContain('QF950');
  });
});

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
    expect(second.previousRoster).toBeDefined(); // Now returns previous roster for duplicates
    expect(second.previousRoster).toEqual(first.roster); // Should be the same roster

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

  test('ingestRosterText does not compare different bid periods', () => {
    jest.resetModules();
    const rosterStore = require('../src/services/roster-store');
    const fs = require('fs');
    const path = require('path');

    // First, ingest BP-3691 roster
    const bp3691Text = fs.readFileSync(
      path.join(__dirname, '../examples/roster-174423-bp-3691.txt'),
      'utf8'
    );

    const first = rosterStore.ingestRosterText(bp3691Text);
    expect(first.isNew).toBe(true);
    expect(first.previousRoster).toBeNull();
    expect(first.roster.summary.bidPeriod).toBe('3691');

    // Then ingest BP-3695 roster (different bid period)
    const bp3695Text = fs.readFileSync(
      path.join(__dirname, '../examples/roster-174423-bp-3695.txt'),
      'utf8'
    );

    const second = rosterStore.ingestRosterText(bp3695Text);
    expect(second.isNew).toBe(true);
    // The key fix: previousRoster should be null because this is a different bid period
    expect(second.previousRoster).toBeNull();
    expect(second.roster.summary.bidPeriod).toBe('3695');
    expect(second.rosterId).toEqual(first.rosterId); // Same employee

    const bucket = rosterStore.getRosterBucket(first.rosterId);
    expect(bucket).toBeDefined();
    // Both rosters should be stored
    expect(bucket.rosters.length).toBe(2);
  });

  test('ingestRosterText compares updates within the SAME bid period only', () => {
    jest.resetModules();
    const rosterStore = require('../src/services/roster-store');
    const fs = require('fs');
    const path = require('path');

    // Scenario: BP 3965 arrives, then BP 3970 arrives, then an UPDATED BP 3965 arrives
    
    // 1. First BP 3965
    const bp3965v1Text = fs.readFileSync(
      path.join(__dirname, '../examples/roster-174423-bp-3691.txt'),
      'utf8'
    ).replace('3691', '3965'); // Simulate BP 3965

    const first = rosterStore.ingestRosterText(bp3965v1Text);
    expect(first.isNew).toBe(true);
    expect(first.previousRoster).toBeNull();
    expect(first.roster.summary.bidPeriod).toBe('3965');

    // 2. Now BP 3970 arrives (different bid period)
    const bp3970Text = fs.readFileSync(
      path.join(__dirname, '../examples/roster-174423-bp-3695.txt'),
      'utf8'
    ).replace('3695', '3970'); // Simulate BP 3970

    const second = rosterStore.ingestRosterText(bp3970Text);
    expect(second.isNew).toBe(true);
    expect(second.previousRoster).toBeNull(); // No comparison to BP 3965
    expect(second.roster.summary.bidPeriod).toBe('3970');

    // 3. Updated BP 3965 arrives (modified version of the same bid period)
    // Change a flight number to make it a meaningful update
    const bp3965v2Text = bp3965v1Text
      .replace(/23 Mon  8085A3      936\/545/g, '23 Mon  8085A3      936/546')
      .replace(/23Jun       545  BNE  1810 SYD  1941/g, '23Jun       546  BNE  1810 SYD  1941');

    const third = rosterStore.ingestRosterText(bp3965v2Text);
    expect(third.isNew).toBe(true);
    expect(third.updated).toBe(true); // This is an update to existing BP 3965
    expect(third.previousRoster).toBeDefined(); // Should compare to BP 3965 v1
    expect(third.previousRoster.summary.bidPeriod).toBe('3965');
    expect(third.roster.summary.bidPeriod).toBe('3965');
    
    // The previous roster should be the original BP 3965, NOT BP 3970
    // Check that previous had the old flight number
    const prevHas545 = third.previousRoster.entries.some(e => 
      e.service && e.service.includes('545')
    );
    expect(prevHas545).toBe(true);

    // Check that new has the updated flight number
    const newHas546 = third.roster.entries.some(e => 
      e.service && e.service.includes('546')
    );
    expect(newHas546).toBe(true);

    const bucket = rosterStore.getRosterBucket(first.rosterId);
    expect(bucket).toBeDefined();
    // Should have 2 rosters: BP 3965 (updated) and BP 3970
    expect(bucket.rosters.length).toBe(2);
    
    // Verify BP 3965 was replaced (not added)
    const bp3965Rosters = bucket.rosters.filter(r => r.summary.bidPeriod === '3965');
    expect(bp3965Rosters.length).toBe(1); // Only one version of BP 3965
    
    const bp3970Rosters = bucket.rosters.filter(r => r.summary.bidPeriod === '3970');
    expect(bp3970Rosters.length).toBe(1); // One version of BP 3970
  });
});


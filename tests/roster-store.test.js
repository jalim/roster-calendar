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

    const second = rosterStore.ingestRosterText(rosterText);
    expect(second.rosterId).toEqual(first.rosterId);
    expect(second.isNew).toBe(false);

    const bucket = rosterStore.getRosterBucket(first.rosterId);
    expect(bucket).toBeDefined();
    expect(Array.isArray(bucket.rosters)).toBe(true);
    expect(bucket.rosters.length).toBe(1);
  });
});

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('roster-store persistence', () => {
  test('persists to JSON and reloads on restart', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-store-'));
    const storePath = path.join(tmpDir, 'store.json');

    const prevEnabled = process.env.ROSTER_PERSIST_ENABLED;
    const prevPath = process.env.ROSTER_PERSIST_PATH;

    process.env.ROSTER_PERSIST_ENABLED = 'true';
    process.env.ROSTER_PERSIST_PATH = storePath;

    try {
      jest.resetModules();
      const rosterStoreA = require('../src/services/roster-store');
      const sample = fs.readFileSync(path.join(__dirname, '../examples/sample-roster.txt'), 'utf8');

      const first = rosterStoreA.ingestRosterText(sample);
      expect(first.isNew).toBe(true);

      await rosterStoreA._flushPersistence();

      // Ensure file written
      expect(fs.existsSync(storePath)).toBe(true);

      // Simulate restart by reloading module in a fresh require context
      jest.resetModules();
      const rosterStoreB = require('../src/services/roster-store');
      const bucket = rosterStoreB.getRosterBucket(first.rosterId);

      expect(bucket).toBeDefined();
      expect(Array.isArray(bucket.rosters)).toBe(true);
      expect(bucket.rosters.length).toBe(1);
    } finally {
      if (prevEnabled === undefined) {
        delete process.env.ROSTER_PERSIST_ENABLED;
      } else {
        process.env.ROSTER_PERSIST_ENABLED = prevEnabled;
      }
      if (prevPath === undefined) {
        delete process.env.ROSTER_PERSIST_PATH;
      } else {
        process.env.ROSTER_PERSIST_PATH = prevPath;
      }
    }
  });
});

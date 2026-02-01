const fs = require('fs');
const os = require('os');
const path = require('path');

describe('pilot-directory', () => {
  test('set/get/list/delete staffNo->email mapping', async () => {
    jest.resetModules();
    const pilotDirectory = require('../src/services/pilot-directory');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-calendar-'));
    const dbPath = path.join(tmpDir, 'pilot-email-map.json');

    const env = {
      ROSTER_PILOT_EMAIL_DB_PATH: dbPath,
      ROSTER_PILOT_EMAIL_DB_READONLY: 'false'
    };

    expect(pilotDirectory.getEmailForStaffNo('174423', env)).toBeNull();

    const saved = pilotDirectory.setEmailForStaffNo('174423', 'Pilot@Example.com', env);
    expect(saved).toEqual({ staffNo: '174423', email: 'pilot@example.com' });

    // Ensure async write chain is drained
    await pilotDirectory._flushWrites();

    expect(pilotDirectory.getEmailForStaffNo('174423', env)).toBe('pilot@example.com');

    const list = pilotDirectory.listPilotEmails(env);
    expect(list).toEqual([{ staffNo: '174423', email: 'pilot@example.com' }]);

    const removed = pilotDirectory.deleteEmailForStaffNo('174423', env);
    expect(removed).toBe(true);

    await pilotDirectory._flushWrites();
    expect(pilotDirectory.getEmailForStaffNo('174423', env)).toBeNull();
  });

  test('setEmailForStaffNo rejects invalid email', () => {
    jest.resetModules();
    const pilotDirectory = require('../src/services/pilot-directory');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-calendar-'));
    const dbPath = path.join(tmpDir, 'pilot-email-map.json');

    const env = {
      ROSTER_PILOT_EMAIL_DB_PATH: dbPath,
      ROSTER_PILOT_EMAIL_DB_READONLY: 'false'
    };

    expect(() => pilotDirectory.setEmailForStaffNo('174423', 'not-an-email', env)).toThrow('email is invalid');
  });
});

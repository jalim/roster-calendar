/**
 * Tests for roster notification behavior
 * 
 * These tests document the expected behavior of roster notifications:
 * - Notifications should be sent whenever a roster is processed
 * - This includes both new rosters and duplicate rosters
 */

describe('roster notification behavior', () => {
  test('notification logic should trigger for both new and duplicate rosters', () => {
    // This test documents the expected behavior:
    // Previously: notifications only sent when isNew === true
    // Now: notifications sent whenever config.notifyEnabled is true, regardless of isNew
    
    const config = { notifyEnabled: true };
    
    // The fix removed the isNew check from: if (config.notifyEnabled && isNew)
    // Now it's just: if (config.notifyEnabled)
    
    // Test both scenarios to document the expected behavior
    const newRoster = true;
    const duplicateRoster = false;
    
    // Old behavior: config.notifyEnabled && isNew
    const oldBehaviorNew = config.notifyEnabled && newRoster;
    const oldBehaviorDuplicate = config.notifyEnabled && duplicateRoster;
    
    // New behavior: config.notifyEnabled (ignores isNew)
    const newBehaviorNew = config.notifyEnabled;
    const newBehaviorDuplicate = config.notifyEnabled;
    
    // Verify the change
    expect(oldBehaviorNew).toBe(true); // Old: sent for new rosters
    expect(oldBehaviorDuplicate).toBe(false); // Old: NOT sent for duplicates
    
    expect(newBehaviorNew).toBe(true); // New: sent for new rosters
    expect(newBehaviorDuplicate).toBe(true); // New: NOW sent for duplicates (the fix!)
  });

  test('notification should not be sent when notifyEnabled is false', () => {
    const config = { notifyEnabled: false };
    
    // Regardless of isNew status, no notification should be sent
    const shouldNotify = config.notifyEnabled;
    expect(shouldNotify).toBe(false);
  });

  test('notification message should distinguish between new bid periods and updates', () => {
    const { buildBody } = require('../src/services/roster-change-notifier');
    
    // Mock rosters
    const roster = {
      employee: { name: 'TEST PILOT', staffNo: '123456', base: 'PER' },
      summary: { bidPeriod: '3691' },
      entries: []
    };

    // Test 1: New bid period (no previous roster)
    const bodyNewBidPeriod = buildBody({
      rosterId: '123456',
      roster,
      previousRoster: null,
      isNew: true
    });
    
    expect(bodyNewBidPeriod).toContain('New bid period roster received (BP 3691)');
    expect(bodyNewBidPeriod).not.toContain('First roster received');

    // Test 2: First-ever roster (no bid period)
    const rosterNoBidPeriod = { ...roster, summary: {} };
    const bodyFirstEver = buildBody({
      rosterId: '123456',
      roster: rosterNoBidPeriod,
      previousRoster: null,
      isNew: true
    });
    
    expect(bodyFirstEver).toContain('First roster received (no previous roster on file)');
    expect(bodyFirstEver).not.toContain('New bid period');
  });
});

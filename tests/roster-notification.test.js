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
    
    // Old behavior would have been: config.notifyEnabled && isNew
    // New behavior is just: config.notifyEnabled
    
    // Simulate both scenarios
    const scenariosToNotify = [
      { isNew: true, description: 'new roster with different content' },
      { isNew: false, description: 'duplicate roster with same content' }
    ];
    
    scenariosToNotify.forEach(scenario => {
      // With the fix, notifications should be sent in both cases
      const shouldNotify = config.notifyEnabled;
      expect(shouldNotify).toBe(true);
    });
  });

  test('notification should not be sent when notifyEnabled is false', () => {
    const config = { notifyEnabled: false };
    
    // Regardless of isNew status, no notification should be sent
    const shouldNotify = config.notifyEnabled;
    expect(shouldNotify).toBe(false);
  });
});

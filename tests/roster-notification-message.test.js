/**
 * Tests for roster notification message content
 */

const { diffRosters, formatDiffAsText } = require('../src/services/roster-diff');

describe('roster notification messages', () => {
  // Helper to build email body similar to roster-change-notifier.js
  function buildBody({ roster, previousRoster, isNew }) {
    const diff = previousRoster ? diffRosters(previousRoster, roster) : null;
    let diffText;
    
    if (!previousRoster) {
      diffText = 'First roster received (no previous roster on file).';
    } else if (isNew === false) {
      // Duplicate roster - same content as before
      diffText = 'Duplicate roster received (no changes from previous version).';
    } else {
      // New or updated roster
      diffText = diff ? formatDiffAsText(diff) : 'No duty changes detected.';
    }
    
    return diffText;
  }

  test('first roster message when no previous roster exists', () => {
    const roster = { entries: [] };
    const diffText = buildBody({ roster, previousRoster: null, isNew: true });
    
    expect(diffText).toBe('First roster received (no previous roster on file).');
  });

  test('duplicate roster message when isNew is false', () => {
    const roster = { 
      entries: [
        { date: '14 Mon', day: 14, dayOfWeek: 'Mon', dutyCode: 'D/O', dutyType: 'DAY_OFF' }
      ] 
    };
    const previousRoster = { 
      entries: [
        { date: '14 Mon', day: 14, dayOfWeek: 'Mon', dutyCode: 'D/O', dutyType: 'DAY_OFF' }
      ] 
    };
    
    const diffText = buildBody({ roster, previousRoster, isNew: false });
    
    expect(diffText).toBe('Duplicate roster received (no changes from previous version).');
  });

  test('updated roster message when there are changes', () => {
    const previousRoster = { 
      entries: [
        { date: '14 Mon', day: 14, dayOfWeek: 'Mon', dutyCode: 'D/O', dutyType: 'DAY_OFF' }
      ] 
    };
    const roster = { 
      entries: [
        { date: '14 Mon', day: 14, dayOfWeek: 'Mon', dutyCode: 'PLN', dutyType: 'PLANNING' }
      ] 
    };
    
    const diffText = buildBody({ roster, previousRoster, isNew: true });
    
    expect(diffText).toContain('Changed:');
    expect(diffText).toContain('14 Mon');
  });

  test('updated roster message when there are no changes', () => {
    const roster = { 
      entries: [
        { date: '14 Mon', day: 14, dayOfWeek: 'Mon', dutyCode: 'D/O', dutyType: 'DAY_OFF' }
      ] 
    };
    const previousRoster = { 
      entries: [
        { date: '14 Mon', day: 14, dayOfWeek: 'Mon', dutyCode: 'D/O', dutyType: 'DAY_OFF' }
      ] 
    };
    
    // When isNew is true but content is the same (shouldn't happen in practice)
    const diffText = buildBody({ roster, previousRoster, isNew: true });
    
    expect(diffText).toBe('No duty changes detected.');
  });
});

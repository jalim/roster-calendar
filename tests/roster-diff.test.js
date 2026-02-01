const fs = require('fs');
const path = require('path');

const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const { diffRosters, formatDiffAsText } = require('../src/services/roster-diff');

describe('roster-diff', () => {
  test('diffRosters reports changed days', () => {
    const originalText = fs.readFileSync(
      path.join(__dirname, '../examples/sample-webcis-roster.txt'),
      'utf8'
    );

    const updatedText = originalText
      .replace('940/950', '940/951')
      .replace('29Dec       950  ', '29Dec       951  ');

    const parser = new QantasRosterParser();
    const prev = parser.parse(originalText);
    const next = parser.parse(updatedText);

    const diff = diffRosters(prev, next);
    expect(diff.hasChanges).toBe(true);

    const changedDates = diff.changed.map(c => c.date);
    expect(changedDates).toContain('29 Mon');

    const changed = diff.changed.find(c => c.date === '29 Mon');
    expect(changed.now).toContain('QF951');
    expect(changed.was).toContain('QF950');

    const text = formatDiffAsText(diff);
    expect(text).toContain('Changed:');
    expect(text).toContain('29 Mon');
  });
});

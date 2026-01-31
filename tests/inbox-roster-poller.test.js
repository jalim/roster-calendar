const {
  chooseRosterTextFromParsedEmail,
  shouldProcessEmail
} = require('../src/services/inbox-roster-poller');

describe('inbox-roster-poller helpers', () => {
  test('chooseRosterTextFromParsedEmail prefers .txt attachment', () => {
    const parsed = {
      attachments: [
        { filename: 'ignore.pdf', content: Buffer.from('nope', 'utf8') },
        { filename: 'roster.txt', content: Buffer.from('QANTAS AIRWAYS LIMITED\nStaff No: 123', 'utf8') }
      ],
      text: 'fallback text'
    };

    const text = chooseRosterTextFromParsedEmail(parsed);
    expect(text).toContain('QANTAS AIRWAYS LIMITED');
  });

  test('chooseRosterTextFromParsedEmail falls back to body text', () => {
    const parsed = {
      attachments: [],
      text: 'QANTAS AIRWAYS LIMITED\nStaff No: 123'
    };
    const text = chooseRosterTextFromParsedEmail(parsed);
    expect(text).toContain('Staff No: 123');
  });

  test('shouldProcessEmail enforces from allowlist', () => {
    const parsed = {
      from: { value: [{ address: 'Sender@Example.com' }] },
      subject: 'Monthly roster'
    };

    expect(
      shouldProcessEmail(parsed, { fromAllowlist: ['sender@example.com'], subjectContains: '' })
    ).toBe(true);

    expect(
      shouldProcessEmail(parsed, { fromAllowlist: ['other@example.com'], subjectContains: '' })
    ).toBe(false);
  });

  test('shouldProcessEmail can filter by subject substring', () => {
    const parsed = {
      from: { value: [{ address: 'sender@example.com' }] },
      subject: 'Monthly roster January'
    };

    expect(
      shouldProcessEmail(parsed, { fromAllowlist: [], subjectContains: 'roster' })
    ).toBe(true);

    expect(
      shouldProcessEmail(parsed, { fromAllowlist: [], subjectContains: 'invoice' })
    ).toBe(false);
  });
});

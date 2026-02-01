jest.mock('../src/services/outbound-email-service', () => ({
  sendEmail: jest.fn(async () => ({ sent: true, messageId: 'test' }))
}));

const { sendEmail } = require('../src/services/outbound-email-service');
const { buildStartupEmail } = require('../src/services/startup-email-notifier');
const { maybeSendStartupEmail } = require('../src/services/startup-email-notifier');

describe('startup-email-notifier', () => {
  test('buildStartupEmail includes core fields', () => {
    const { subject, text } = buildStartupEmail({
      env: { NODE_ENV: 'test' },
      port: 3000,
      inboxConfig: {
        enabled: true,
        mailbox: 'INBOX',
        intervalMs: 60000,
        searchMode: 'unseen',
        processedMailbox: 'Processed'
      }
    });

    expect(subject).toMatch(/\[roster-calendar\] started on /);
    expect(text).toContain('Roster Calendar Service startup');
    expect(text).toContain('Env: test');
    expect(text).toContain('Port: 3000');
    expect(text).toContain('Inbox polling:');
    expect(text).toContain('- mailbox: INBOX');
  });

  test('maybeSendStartupEmail forces outbound enabled when startup enabled', async () => {
    await maybeSendStartupEmail(
      {
        ROSTER_STARTUP_EMAIL_ENABLED: 'true',
        ROSTER_OUTBOUND_EMAIL_ENABLED: 'false',
        ROSTER_NOTIFY_ENABLED: 'false'
      },
      console,
      { port: 3000 }
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const envArg = sendEmail.mock.calls[0][1];
    expect(envArg.ROSTER_OUTBOUND_EMAIL_ENABLED).toBe('true');
  });
});

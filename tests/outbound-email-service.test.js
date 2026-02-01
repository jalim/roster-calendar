const { getOutboundEmailConfig } = require('../src/services/outbound-email-service');

describe('outbound-email-service getOutboundEmailConfig', () => {
  test('enabled defaults to ROSTER_NOTIFY_ENABLED when ROSTER_OUTBOUND_EMAIL_ENABLED not set', () => {
    const cfg = getOutboundEmailConfig({
      ROSTER_NOTIFY_ENABLED: 'true',
      ROSTER_SMTP_HOST: 'smtp.example.com',
      ROSTER_SMTP_USER: 'user',
      ROSTER_SMTP_PASS: 'pass'
    });

    expect(cfg.enabled).toBe(true);
  });

  test('enabled can be controlled via ROSTER_OUTBOUND_EMAIL_ENABLED', () => {
    const cfg = getOutboundEmailConfig({
      ROSTER_NOTIFY_ENABLED: 'false',
      ROSTER_OUTBOUND_EMAIL_ENABLED: 'true',
      ROSTER_SMTP_HOST: 'smtp.example.com',
      ROSTER_SMTP_USER: 'user',
      ROSTER_SMTP_PASS: 'pass'
    });

    expect(cfg.enabled).toBe(true);
  });

  test('infers secure=true when port is 465 and secure not specified', () => {
    const cfg = getOutboundEmailConfig({
      ROSTER_NOTIFY_ENABLED: 'true',
      ROSTER_SMTP_HOST: 'smtp.example.com',
      ROSTER_SMTP_PORT: '465',
      ROSTER_SMTP_USER: 'user',
      ROSTER_SMTP_PASS: 'pass'
      // ROSTER_SMTP_SECURE intentionally omitted
    });

    expect(cfg.port).toBe(465);
    expect(cfg.secure).toBe(true);
  });

  test('infers secure=false when port is 587 and secure not specified', () => {
    const cfg = getOutboundEmailConfig({
      ROSTER_NOTIFY_ENABLED: 'true',
      ROSTER_SMTP_HOST: 'smtp.example.com',
      ROSTER_SMTP_PORT: '587',
      ROSTER_SMTP_USER: 'user',
      ROSTER_SMTP_PASS: 'pass'
    });

    expect(cfg.port).toBe(587);
    expect(cfg.secure).toBe(false);
  });

  test('respects explicit ROSTER_SMTP_SECURE', () => {
    const cfg = getOutboundEmailConfig({
      ROSTER_NOTIFY_ENABLED: 'true',
      ROSTER_SMTP_HOST: 'smtp.example.com',
      ROSTER_SMTP_PORT: '465',
      ROSTER_SMTP_SECURE: 'false',
      ROSTER_SMTP_USER: 'user',
      ROSTER_SMTP_PASS: 'pass'
    });

    expect(cfg.port).toBe(465);
    expect(cfg.secure).toBe(false);
  });
});

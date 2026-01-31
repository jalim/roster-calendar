require('dotenv').config();
const { ImapFlow } = require('imapflow');

function envBool(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return defaultValue;
  return String(v).trim().toLowerCase() === 'true';
}

async function main() {
  const host = process.env.ROSTER_EMAIL_IMAP_HOST;
  const port = Number(process.env.ROSTER_EMAIL_IMAP_PORT || 143);
  const secure = envBool('ROSTER_EMAIL_IMAP_SECURE', false);
  const doSTARTTLS = envBool('ROSTER_EMAIL_IMAP_STARTTLS', true);
  const user = process.env.ROSTER_EMAIL_IMAP_USER;
  const pass = process.env.ROSTER_EMAIL_IMAP_PASS;
  const configuredMailbox = process.env.ROSTER_EMAIL_IMAP_MAILBOX || 'INBOX';

  const client = new ImapFlow({
    host,
    port,
    secure,
    doSTARTTLS,
    logger: false,
    auth: { user, pass }
  });

  await client.connect();
  try {
    const mailboxes = await client.list({ statusQuery: { messages: true, unseen: true, recent: true } });

    mailboxes.sort((a, b) => {
      const ap = String(a.path).toUpperCase();
      const bp = String(b.path).toUpperCase();
      if (ap === 'INBOX' && bp !== 'INBOX') return -1;
      if (bp === 'INBOX' && ap !== 'INBOX') return 1;
      return ap.localeCompare(bp);
    });

    console.log('[imap] Mailboxes (messages/unseen/recent):');
    for (const m of mailboxes) {
      const status = m.status || {};
      const messages = status.messages ?? '?';
      const unseen = status.unseen ?? '?';
      const recent = status.recent ?? '?';
      const flags = Array.isArray(m.flags) ? m.flags.join(',') : '';
      console.log(`- ${m.path}  messages=${messages} unseen=${unseen} recent=${recent} flags=${flags}`);
    }

    const mbStatus = await client.status(configuredMailbox, { messages: true, unseen: true, recent: true });
    console.log('[imap] Configured mailbox status:', mbStatus);

    // Mirror poller behavior: SEARCH UNSEEN
    {
      const lock = await client.getMailboxLock(configuredMailbox);
      try {
        const unseenUids = await client.search({ seen: false });
        console.log(`[imap] SEARCH UNSEEN in ${configuredMailbox}:`, unseenUids);
      } finally {
        lock.release();
      }
    }

    // If configured mailbox has messages, print subjects + flags of last 20
    if (mbStatus && mbStatus.messages && mbStatus.messages > 0) {
      const lock = await client.getMailboxLock(configuredMailbox);
      try {
        const exists = client.mailbox && client.mailbox.exists ? client.mailbox.exists : 0;
        const start = Math.max(1, exists - 19);
        const range = `${start}:${exists}`;

        console.log(`[imap] Recent messages in ${configuredMailbox} (${range}):`);
        for await (const msg of client.fetch(range, { uid: true, flags: true, envelope: true })) {
          const subject = msg.envelope && msg.envelope.subject ? msg.envelope.subject : '';
          const from = msg.envelope && msg.envelope.from && msg.envelope.from[0] ? msg.envelope.from[0].address : '';
          const flags = Array.isArray(msg.flags) ? msg.flags.join(',') : '';
          console.log(`  uid=${msg.uid} flags=${flags} from=${from} subject=${subject}`);
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout();
  }
}

main().catch(err => {
  console.error('[imap] error:', err && err.message);
  process.exit(2);
});

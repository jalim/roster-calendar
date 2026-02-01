const { diffRosters, formatDiffAsText } = require('./roster-diff');
const pilotDirectory = require('./pilot-directory');
const { sendEmail } = require('./outbound-email-service');

function safeString(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function buildFilename({ rosterId, roster }) {
  const periodKey = roster && roster._periodKey ? safeString(roster._periodKey) : '';
  const suffix = periodKey ? `-${periodKey}` : '';
  return `roster-${rosterId}${suffix}.txt`;
}

function buildSubject({ roster }) {
  const employee = roster && roster.employee ? roster.employee : {};
  const name = employee.name ? safeString(employee.name).trim() : 'Pilot';
  const staffNo = employee.staffNo ? safeString(employee.staffNo).trim() : '';
  const bp = roster && roster.summary && roster.summary.bidPeriod ? safeString(roster.summary.bidPeriod).trim() : '';

  const bits = [`Roster update - ${name}`];
  if (staffNo) bits.push(`(${staffNo})`);
  if (bp) bits.push(`BP ${bp}`);

  return bits.join(' ');
}

function buildBody({ rosterId, roster, previousRoster, isNew }) {
  const employee = roster && roster.employee ? roster.employee : {};
  const name = employee.name ? safeString(employee.name).trim() : '';
  const staffNo = employee.staffNo ? safeString(employee.staffNo).trim() : '';
  const base = employee.base ? safeString(employee.base).trim() : '';
  const bidPeriod = roster && roster.summary && roster.summary.bidPeriod ? safeString(roster.summary.bidPeriod).trim() : '';

  const diff = previousRoster ? diffRosters(previousRoster, roster) : null;
  let diffText;
  
  if (!previousRoster) {
    if (bidPeriod) {
      diffText = `New bid period roster received (BP ${bidPeriod}).`;
    } else {
      diffText = 'First roster received (no previous roster on file).';
    }
  } else if (isNew === false) {
    // Duplicate roster - same content as before
    diffText = 'Duplicate roster received (no changes from previous version).';
  } else {
    // New or updated roster
    diffText = diff ? formatDiffAsText(diff) : 'No duty changes detected.';
  }

  const lines = [];
  lines.push('Roster Calendar Service');
  lines.push('');
  lines.push(`Roster ID: ${rosterId}`);
  if (name) lines.push(`Name: ${name}`);
  if (staffNo) lines.push(`Staff No: ${staffNo}`);
  if (base) lines.push(`Base: ${base}`);
  lines.push('');
  lines.push('Change summary vs previous roster:');
  lines.push(diffText);

  return lines.join('\n');
}

async function notifyRosterChange({ rosterId, rosterText, roster, previousRoster, isNew }, env = process.env, logger = console) {
  const staffNo = roster && roster.employee && roster.employee.staffNo ? safeString(roster.employee.staffNo).trim() : '';
  if (!staffNo) {
    return { notified: false, reason: 'missing-staffNo' };
  }

  const to = pilotDirectory.getEmailForStaffNo(staffNo, env);
  if (!to) {
    return { notified: false, reason: 'no-email-mapping' };
  }

  const subject = buildSubject({ roster });
  const text = buildBody({ rosterId, roster, previousRoster, isNew });

  const attachmentName = buildFilename({ rosterId, roster });

  const result = await sendEmail(
    {
      to,
      subject,
      text,
      attachments: [
        {
          filename: attachmentName,
          content: safeString(rosterText),
          contentType: 'text/plain; charset=utf-8'
        }
      ]
    },
    env,
    logger
  );

  if (result && result.sent) {
    logger.log('[notify] roster email sent', { to, rosterId, messageId: result.messageId });
    return { notified: true, to, messageId: result.messageId };
  }

  return { notified: false, to, reason: result && result.reason ? result.reason : 'not-sent' };
}

module.exports = {
  notifyRosterChange,
  // For testing
  buildBody
};

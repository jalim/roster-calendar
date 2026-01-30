/**
 * Email service for receiving roster files
 * This is a placeholder/skeleton for email integration
 * In production, you would integrate with an email service like:
 * - AWS SES
 * - SendGrid Inbound Parse
 * - Mailgun Routes
 * - Google Cloud Functions with Gmail API
 */

const QantasRosterParser = require('../parsers/qantas-roster-parser');
const ICSCalendarService = require('./ics-calendar-service');

class EmailService {
  /**
   * Process an incoming email with roster attachment
   * This would be called by your email service webhook
   * @param {Object} emailData - Email data from email service
   * @returns {Promise<Object>} Processing result
   */
  async processIncomingEmail(emailData) {
    try {
      const { from, subject, text, attachments } = emailData;

      console.log(`Processing email from: ${from}`);
      console.log(`Subject: ${subject}`);

      // Extract roster text from email body or attachments
      let rosterText = null;

      // Check for text in email body
      if (text && this.looksLikeRoster(text)) {
        rosterText = text;
      }

      // Check attachments
      if (!rosterText && attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          if (attachment.filename.match(/\.(txt|text)$/i)) {
            rosterText = attachment.content;
            break;
          }
        }
      }

      if (!rosterText) {
        throw new Error('No roster text found in email');
      }

      // Parse the roster
      const parser = new QantasRosterParser();
      const roster = parser.parse(rosterText);

      // Generate ICS calendar
      const icsService = new ICSCalendarService();
      const icsData = await icsService.generateICS(roster);

      return {
        success: true,
        employee: roster.employee,
        entriesCount: roster.entries.length,
        icsData: icsData
      };
    } catch (error) {
      console.error('Error processing email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if text looks like a Qantas roster
   * @param {string} text - Text to check
   * @returns {boolean} True if looks like roster
   */
  looksLikeRoster(text) {
    return text.includes('QANTAS AIRWAYS') || 
           text.includes('Flight Crew Roster') ||
           text.includes('Staff No:');
  }

  /**
   * Send ICS calendar via email
   * @param {string} toEmail - Recipient email
   * @param {string} icsData - ICS calendar data
   * @param {Object} employee - Employee information
   * @returns {Promise<boolean>} Success status
   */
  async sendCalendar(toEmail, icsData, employee) {
    // This would integrate with an email sending service
    // For now, just log what would be sent
    console.log(`Would send calendar to: ${toEmail}`);
    console.log(`Employee: ${employee.name}`);
    console.log(`ICS size: ${icsData.length} bytes`);

    // In production, use nodemailer or similar:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({ ... });
    // await transporter.sendMail({
    //   from: 'roster@example.com',
    //   to: toEmail,
    //   subject: `Your Roster Calendar - ${employee.name}`,
    //   text: 'Please find your roster calendar attached.',
    //   attachments: [{
    //     filename: 'roster.ics',
    //     content: icsData
    //   }]
    // });

    return true;
  }
}

module.exports = EmailService;

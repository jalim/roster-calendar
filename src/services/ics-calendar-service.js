/**
 * Service to convert roster data to ICS calendar format
 */

const ics = require('ics');

class ICSCalendarService {
  /**
   * Convert roster to ICS format
   * @param {Object} roster - Parsed roster data
   * @returns {Promise<string>} ICS calendar string
   */
  async generateICS(roster) {
    const events = this.convertRosterToEvents(roster);
    
    return new Promise((resolve, reject) => {
      ics.createEvents(events, (error, value) => {
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      });
    });
  }

  /**
   * Convert roster entries to calendar events
   * @param {Object} roster - Parsed roster data
   * @returns {Array} Array of event objects
   */
  convertRosterToEvents(roster) {
    const events = [];
    const QantasRosterParser = require('../parsers/qantas-roster-parser');
    const parser = new QantasRosterParser();
    const period = parser.getRosterPeriod(roster);

    let currentMonth = period.startMonth;
    let currentYear = period.startYear;
    let previousDay = 0;

    for (const entry of roster.entries) {
      // Detect month rollover
      if (entry.day < previousDay) {
        currentMonth = (currentMonth + 1) % 12;
        if (currentMonth === 0) {
          currentYear++;
        }
      }
      previousDay = entry.day;

      const event = this.createEventFromEntry(entry, currentMonth, currentYear, roster.employee);
      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Create a calendar event from a roster entry
   * @param {Object} entry - Roster entry
   * @param {number} month - Month number (0-11)
   * @param {number} year - Year
   * @param {Object} employee - Employee information
   * @returns {Object|null} Event object or null if should be skipped
   */
  createEventFromEntry(entry, month, year, employee) {
    // Skip D/O (Day Off) entries - pilots don't need these in their calendar
    if (entry.dutyType === 'OFF') {
      return null;
    }

    const day = entry.day;
    let title, description, startTime, endTime, duration;

    switch (entry.dutyType) {
      case 'FLIGHT':
        title = `Flight: ${entry.dutyCode}`;
        if (entry.service) {
          title += ` - ${entry.service}`;
        }
        description = this.buildFlightDescription(entry);
        startTime = this.parseTime(entry.signOn);
        endTime = this.parseTime(entry.signOff);
        break;

      case 'RESERVE':
        title = `Reserve Duty: ${entry.dutyCode}`;
        description = `Reserve duty\nSign On: ${entry.signOn || 'N/A'}\nSign Off: ${entry.signOff || 'N/A'}`;
        startTime = this.parseTime(entry.signOn);
        endTime = this.parseTime(entry.signOff);
        break;

      case 'PLANNING':
        title = 'Planning Day';
        description = 'Planning day';
        startTime = [9, 0]; // Default to 9 AM
        duration = { hours: 8 };
        break;

      case 'ANNUAL_LEAVE':
        title = 'Annual Leave';
        description = 'Annual leave';
        startTime = [0, 0];
        duration = { days: 1 };
        break;

      default:
        title = entry.dutyCode || 'Duty';
        description = `Duty: ${entry.description || entry.dutyCode}`;
        startTime = this.parseTime(entry.signOn);
        endTime = this.parseTime(entry.signOff);
        break;
    }

    // Create the event object
    const event = {
      title,
      description,
      start: [year, month + 1, day, ...(startTime || [0, 0])],
      productId: 'roster-calendar/ics',
      calName: `${employee.name || 'Pilot'} Roster`,
      uid: `${year}-${month + 1}-${day}-${entry.dutyCode || 'duty'}-${Math.random().toString(36).substr(2, 9)}@roster-calendar`
    };

    // Set end time or duration
    if (endTime) {
      // Check if end time crosses midnight (next day)
      if (endTime[0] < (startTime ? startTime[0] : 0) || 
          (entry.signOff && entry.signOff.includes('+'))) {
        // Event ends the next day
        const nextDay = new Date(year, month, day + 1);
        event.end = [nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate(), ...endTime];
      } else {
        event.end = [year, month + 1, day, ...endTime];
      }
    } else if (duration) {
      event.duration = duration;
    } else if (startTime) {
      // Default duration of 8 hours if we have a start but no end
      event.duration = { hours: 8 };
    } else {
      // All-day event
      event.duration = { days: 1 };
    }

    return event;
  }

  /**
   * Build description for flight entries
   * @param {Object} entry - Roster entry
   * @returns {string} Description text
   */
  buildFlightDescription(entry) {
    let desc = `Duty: ${entry.dutyCode}\n`;
    
    if (entry.service) {
      desc += `Flight(s): ${entry.service}\n`;
    }
    
    if (entry.passive) {
      desc += `Type: Passive (Positioning)\n`;
    }
    
    if (entry.signOn) {
      desc += `Sign On: ${entry.signOn}\n`;
    }
    
    if (entry.signOff) {
      desc += `Sign Off: ${entry.signOff}\n`;
    }
    
    if (entry.dutyHours) {
      desc += `Duty Hours: ${entry.dutyHours}\n`;
    }
    
    if (entry.creditHours) {
      desc += `Credit Hours: ${entry.creditHours}\n`;
    }
    
    if (entry.port) {
      desc += `Port: ${entry.port}\n`;
    }
    
    if (entry.code) {
      desc += `Code: ${entry.code}`;
    }
    
    return desc.trim();
  }

  /**
   * Parse time string to [hour, minute]
   * @param {string} timeStr - Time string like "0900" or "1545"
   * @returns {Array|null} [hour, minute] or null
   */
  parseTime(timeStr) {
    if (!timeStr) return null;
    
    // Remove any day indicators like +1
    timeStr = timeStr.replace(/\+\d+$/, '');
    
    if (timeStr.length === 4) {
      const hour = parseInt(timeStr.substring(0, 2));
      const minute = parseInt(timeStr.substring(2, 4));
      return [hour, minute];
    }
    
    return null;
  }
}

module.exports = ICSCalendarService;

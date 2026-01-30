/**
 * Parser for Qantas roster text files
 * Handles the Qantas Airways Limited roster format
 */

class QantasRosterParser {
  /**
   * Parse a Qantas roster text file
   * @param {string} rosterText - The raw roster text content
   * @returns {Object} Parsed roster data
   */
  parse(rosterText) {
    const lines = rosterText.split('\n');
    
    const roster = {
      employee: {},
      entries: [],
      summary: {}
    };

    // Parse header information
    this.parseHeader(lines, roster);
    
    // Parse roster entries
    this.parseRosterEntries(lines, roster);

    return roster;
  }

  /**
   * Parse header information from roster
   * @param {Array} lines - Array of text lines
   * @param {Object} roster - Roster object to populate
   */
  parseHeader(lines, roster) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Extract employee information
      if (line.includes('Name    :')) {
        const match = line.match(/Name\s+:\s+(.+?)\s{2,}/);
        if (match) roster.employee.name = match[1].trim();
      }
      
      if (line.includes('Staff No:')) {
        const match = line.match(/Staff No:\s+(\d+)/);
        if (match) roster.employee.staffNo = match[1].trim();
      }
      
      if (line.includes('Category:')) {
        const match = line.match(/Category:\s+(.+?)$/);
        if (match) roster.employee.category = match[1].trim();
      }
      
      if (line.includes('Base    :')) {
        const match = line.match(/Base\s+:\s+(\w+)/);
        if (match) roster.employee.base = match[1].trim();
      }
      
      if (line.includes('Line    :')) {
        const match = line.match(/Line\s+:\s+(\w+)/);
        if (match) roster.employee.line = match[1].trim();
      }
      
      // Stop parsing header when we reach the roster data header
      if (line.includes('Date') && line.includes('Duty(Role)')) {
        break;
      }
    }
  }

  /**
   * Parse roster entries from the main roster table
   * @param {Array} lines - Array of text lines
   * @param {Object} roster - Roster object to populate
   */
  parseRosterEntries(lines, roster) {
    let inDataSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if we're entering the data section
      if (line.includes('Date') && line.includes('Duty(Role)')) {
        inDataSection = true;
        continue;
      }
      
      // Stop if we reach the summary section
      if (line.includes('Total Duty Hours') || line.includes('*** End of Report ***')) {
        break;
      }
      
      if (!inDataSection) continue;
      
      // Skip separator lines
      if (line.match(/^-+$/)) continue;
      
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Parse roster line
      const entry = this.parseRosterLine(line);
      if (entry) {
        roster.entries.push(entry);
      }
    }
  }

  /**
   * Parse a single roster line
   * @param {string} line - A single line from the roster
   * @returns {Object|null} Parsed entry or null if invalid
   */
  parseRosterLine(line) {
    // Skip if line doesn't start with a date pattern
    if (!line.match(/^\d{1,2}\s+\w{3}/)) {
      return null;
    }

    // Extract components using positional parsing
    // Format: Date  Duty(Role)  Service  S-On S-Of Duty  Credit Port Code
    const dateMatch = line.match(/^(\d{1,2})\s+(\w{3})/);
    if (!dateMatch) return null;

    const day = parseInt(dateMatch[1]);
    const dayOfWeek = dateMatch[2];
    
    // Extract the rest of the line after the day of week
    const restOfLine = line.substring(dateMatch[0].length).trim();
    
    const entry = {
      day: day,
      dayOfWeek: dayOfWeek,
      date: `${day} ${dayOfWeek}`
    };

    // Check if this is a continuation line (no duty code, starts with service)
    const serviceOnlyMatch = restOfLine.match(/^\s*(P?\d+(?:\/\d+)?)\s+(\d{4})\s+(\d{4})/);
    if (serviceOnlyMatch) {
      entry.dutyType = 'FLIGHT';
      entry.service = serviceOnlyMatch[1];
      entry.signOn = serviceOnlyMatch[2];
      entry.signOff = serviceOnlyMatch[3];
      
      // Check for passive flights (starting with P)
      if (entry.service && entry.service.startsWith('P')) {
        entry.passive = true;
        entry.description = `Passive Flight ${entry.service}`;
      }
      
      // Parse duty and credit hours
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        entry.creditHours = hoursMatch[2];
      }
      
      return entry;
    }

    // Parse duty code (first non-whitespace token)
    const dutyMatch = restOfLine.match(/^(\S+)/);
    if (!dutyMatch) {
      return entry;
    }

    entry.dutyCode = dutyMatch[1];
    
    // Check for specific duty types
    if (entry.dutyCode === 'D/O') {
      entry.dutyType = 'OFF';
      entry.description = 'Day Off';
      // Extract code at the end if present
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode === 'PLN') {
      entry.dutyType = 'PLANNING';
      entry.description = 'Planning Day';
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode.match(/^R\d+$/)) {
      entry.dutyType = 'RESERVE';
      entry.description = `Reserve Duty ${entry.dutyCode}`;
      // Parse times if present
      const timeMatch = restOfLine.match(/(\d{4})\s+(\d{4})/);
      if (timeMatch) {
        entry.signOn = timeMatch[1];
        entry.signOff = timeMatch[2];
      }
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else if (entry.dutyCode === 'AV') {
      entry.dutyType = 'ANNUAL_LEAVE';
      entry.description = 'Annual Leave';
      const codeMatch = restOfLine.match(/\s+([A-Z0-9]+)\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    } else {
      entry.dutyType = 'FLIGHT';
      
      // Parse service (could be flight number or multiple flights)
      const serviceMatch = restOfLine.match(/^\S+\s+(P?\d+(?:\/\d+)?)/);
      if (serviceMatch) {
        entry.service = serviceMatch[1];
        
        // Check for passive flights (starting with P)
        if (entry.service && entry.service.startsWith('P')) {
          entry.passive = true;
        }
      }
      
      // Parse times - look for 4-digit time patterns
      // Make sure we skip the service field by starting after it
      const afterService = entry.service 
        ? restOfLine.substring(restOfLine.indexOf(entry.service) + entry.service.length)
        : restOfLine;
      
      const times = afterService.match(/\b(\d{4})\s+(\d{4})\b/);
      if (times) {
        entry.signOn = times[1];
        entry.signOff = times[2];
      }
      
      // Parse duty and credit hours
      const hoursMatch = restOfLine.match(/(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/);
      if (hoursMatch) {
        entry.dutyHours = hoursMatch[1];
        entry.creditHours = hoursMatch[2];
      }
      
      // Parse port (3-letter code before the final code)
      const portMatch = restOfLine.match(/\b([A-Z]{3})\s+[A-Z0-9]+\s*$/);
      if (portMatch) {
        entry.port = portMatch[1];
      }
      
      // Parse final code
      const codeMatch = restOfLine.match(/\b([A-Z]{2}\d{2})\s*$/);
      if (codeMatch) {
        entry.code = codeMatch[1];
      }
    }

    return entry;
  }

  /**
   * Extract month and year from roster
   * @param {Object} roster - Parsed roster object
   * @returns {Object} Object with month and year
   */
  getMonthYear(roster) {
    // Try to extract from the first entry
    if (roster.entries.length > 0) {
      const firstEntry = roster.entries[0];
      
      // Infer month and year from day of week pattern
      // This is a simplification - in a real implementation, you'd want to
      // extract this from the roster header or filename
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Default to current date for now
      const now = new Date();
      return { 
        month: now.getMonth(), 
        year: now.getFullYear() 
      };
    }

    return { 
      month: new Date().getMonth(), 
      year: new Date().getFullYear() 
    };
  }

  /**
   * Get roster period from entries
   * Analyzes entries to determine the month(s) covered
   * @param {Object} roster - Parsed roster object
   * @returns {Object} Object with startMonth, startYear, endMonth, endYear
   */
  getRosterPeriod(roster) {
    if (roster.entries.length === 0) {
      const now = new Date();
      return {
        startMonth: now.getMonth(),
        startYear: now.getFullYear(),
        endMonth: now.getMonth(),
        endYear: now.getFullYear()
      };
    }

    // Get first and last day numbers
    const firstDay = roster.entries[0].day;
    const lastDay = roster.entries[roster.entries.length - 1].day;

    // If last day < first day, we've crossed into next month
    const now = new Date();
    let startMonth = now.getMonth();
    let startYear = now.getFullYear();
    let endMonth = startMonth;
    let endYear = startYear;

    if (lastDay < firstDay) {
      endMonth = (startMonth + 1) % 12;
      if (endMonth === 0) {
        endYear = startYear + 1;
      }
    }

    return { startMonth, startYear, endMonth, endYear };
  }
}

module.exports = QantasRosterParser;

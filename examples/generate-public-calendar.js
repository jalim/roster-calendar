#!/usr/bin/env node

/**
 * Example: Generate and display public calendar
 * 
 * This script demonstrates how to generate a public calendar from a roster file.
 * The public calendar shows only busy/free status without sensitive details.
 */

const fs = require('fs');
const path = require('path');
const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const ICSCalendarService = require('../src/services/ics-calendar-service');

// Parse command line arguments
const args = process.argv.slice(2);
const rosterFile = args[0] || './examples/sample-roster.txt';

if (!fs.existsSync(rosterFile)) {
  console.error(`Error: Roster file not found: ${rosterFile}`);
  console.error('\nUsage: node generate-public-calendar.js [roster-file]');
  console.error('Example: node generate-public-calendar.js examples/sample-roster.txt');
  process.exit(1);
}

console.log('═'.repeat(80));
console.log('PUBLIC CALENDAR GENERATOR');
console.log('═'.repeat(80));
console.log(`\nReading roster from: ${rosterFile}`);

// Read and parse the roster
const rosterText = fs.readFileSync(rosterFile, 'utf-8');
const parser = new QantasRosterParser();
const roster = parser.parse(rosterText);

console.log(`\nPilot: ${roster.employee.name} (${roster.employee.staffNo})`);
console.log(`Base: ${roster.employee.base}`);
console.log(`Category: ${roster.employee.category}`);
console.log(`Entries: ${roster.entries.length}`);

// Generate both full and public calendars for comparison
const icsService = new ICSCalendarService();

console.log('\n' + '─'.repeat(80));
console.log('COMPARISON: Full Calendar vs Public Calendar');
console.log('─'.repeat(80));

// Show a sample of events side-by-side
const publicEvents = icsService.convertRosterToPublicEvents(roster);
const fullEvents = icsService.convertRosterToEvents(roster);

console.log('\n' + ' '.repeat(20) + 'FULL CALENDAR' + ' '.repeat(25) + '|' + ' '.repeat(10) + 'PUBLIC CALENDAR');
console.log('─'.repeat(80));

// Take first 10 entries for comparison
const entriesToShow = Math.min(10, roster.entries.length);

for (let i = 0; i < entriesToShow; i++) {
  const entry = roster.entries[i];
  const fullEvent = fullEvents[i];
  const publicEvent = publicEvents[i];

  if (fullEvent && publicEvent) {
    const day = String(entry.day).padStart(2, ' ');
    const dow = (entry.dayOfWeek || '').padEnd(3);
    
    // Full event title (truncated if needed)
    const fullTitle = (fullEvent.title || 'N/A').substring(0, 30).padEnd(30);
    
    // Public event title
    const publicTitle = (publicEvent.title || 'N/A').padEnd(15);
    
    console.log(`${day} ${dow} | ${fullTitle} | ${publicTitle}`);
  }
}

// Generate the public ICS file
console.log('\n' + '─'.repeat(80));
console.log('GENERATING PUBLIC ICS CALENDAR');
console.log('─'.repeat(80));

icsService.generatePublicICSForRosters([roster])
  .then(icsData => {
    const outputFile = './public-calendar.ics';
    fs.writeFileSync(outputFile, icsData);
    
    console.log(`\n✓ Public calendar generated: ${outputFile}`);
    
    // Show statistics
    const busyCount = (icsData.match(/SUMMARY:Busy/g) || []).length;
    const freeCount = (icsData.match(/SUMMARY:Free/g) || []).length;
    
    console.log(`\nStatistics:`);
    console.log(`  Busy periods: ${busyCount}`);
    console.log(`  Free periods: ${freeCount}`);
    console.log(`  Total events: ${busyCount + freeCount}`);
    
    // Verify no sensitive information leaked
    const hasSensitiveInfo = 
      icsData.includes('Flight') ||
      icsData.includes('QF') ||
      icsData.match(/\d{4}A\d/) ||
      icsData.includes('credit') ||
      icsData.includes('Credit');
    
    if (hasSensitiveInfo) {
      console.log('\n⚠️  WARNING: Sensitive information detected in public calendar!');
    } else {
      console.log('\n✓ No sensitive information detected - calendar is safe to share');
    }
    
    console.log('\nYou can now subscribe to this calendar in any calendar app.');
    console.log('Share the subscription URL with family/friends who need to know your availability.');
    
    console.log('\n' + '═'.repeat(80));
  })
  .catch(error => {
    console.error('\n✗ Error generating public calendar:', error.message);
    process.exit(1);
  });

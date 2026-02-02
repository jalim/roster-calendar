#!/usr/bin/env node

/**
 * Demo script showing how to calculate roster value based on pilot pay rates
 * 
 * This script:
 * 1. Sets a pay rate for a pilot
 * 2. Parses a roster file
 * 3. Enriches the roster with duty value calculations
 * 4. Displays a summary of the duties and their values
 */

const fs = require('fs');
const path = require('path');
const QantasRosterParser = require('../src/parsers/qantas-roster-parser');
const pilotDirectory = require('../src/services/pilot-directory');

// Configuration
const ROSTER_FILE = process.argv[2] || path.join(__dirname, 'roster-174423-bp-3715.txt');
const PAY_RATE = process.argv[3] ? parseFloat(process.argv[3]) : 150.00;

console.log('Roster Value Calculator');
console.log('======================\n');

// Read and parse the roster
console.log(`Reading roster from: ${ROSTER_FILE}`);
const rosterText = fs.readFileSync(ROSTER_FILE, 'utf-8');

const parser = new QantasRosterParser();
const roster = parser.parse(rosterText);

console.log(`\nPilot Information:`);
console.log(`  Name: ${roster.employee.name}`);
console.log(`  Staff No: ${roster.employee.staffNo}`);
console.log(`  Category: ${roster.employee.category}`);
console.log(`  Base: ${roster.employee.base}`);

// Set pay rate for the pilot (optional - in production this would already be set)
const staffNo = roster.employee.staffNo;
if (staffNo) {
  console.log(`\nSetting hourly pay rate for Staff No ${staffNo}: $${PAY_RATE.toFixed(2)}`);
  try {
    pilotDirectory.setPayRateForStaffNo(staffNo, PAY_RATE);
  } catch (err) {
    // Ignore readonly errors in demo
    if (err.code !== 'PILOT_PAY_RATE_DB_READONLY') {
      console.error(`Warning: Could not save pay rate: ${err.message}`);
    }
  }
}

// Enrich roster with duty values
console.log(`\nCalculating duty values at $${PAY_RATE.toFixed(2)}/hour...`);
const enrichedRoster = QantasRosterParser.enrichRosterWithDutyValues(roster, PAY_RATE);

// Display duties with credit hours and values
console.log(`\nDuties with Pay Calculations:`);
console.log('─'.repeat(80));
console.log('Date    Duty         Service       Sign-On  Sign-Off  Credit   Value');
console.log('─'.repeat(80));

enrichedRoster.entries.forEach(entry => {
  if (entry.creditHours) {
    const dateStr = entry.day ? String(entry.day).padStart(2, ' ') : '  ';
    const dayOfWeek = entry.dayOfWeek || '';
    const dutyCode = (entry.dutyCode || '').padEnd(12);
    const service = (entry.service || '').padEnd(13);
    const signOn = (entry.signOn || '').padEnd(8);
    const signOff = (entry.signOff || '').padEnd(9);
    const creditHours = (entry.creditHours || '').padEnd(8);
    const dutyValue = entry.dutyValue ? `$${entry.dutyValue.toFixed(2)}` : '';
    
    console.log(`${dateStr} ${dayOfWeek}  ${dutyCode} ${service} ${signOn} ${signOff} ${creditHours} ${dutyValue}`);
  }
});

console.log('─'.repeat(80));

// Display summary
if (enrichedRoster.summary) {
  console.log(`\nRoster Summary:`);
  
  const totalEntries = enrichedRoster.entries.length;
  const dutyEntries = enrichedRoster.entries.filter(e => e.creditHours).length;
  const totalCreditHours = enrichedRoster.entries.reduce((sum, e) => {
    if (e.creditHours) {
      const decimal = QantasRosterParser.creditHoursToDecimal(e.creditHours);
      return sum + (decimal || 0);
    }
    return sum;
  }, 0);
  
  console.log(`  Total Entries: ${totalEntries}`);
  console.log(`  Paid Duties: ${dutyEntries}`);
  console.log(`  Total Credit Hours: ${totalCreditHours.toFixed(2)}`);
  console.log(`  Hourly Pay Rate: $${enrichedRoster.summary.payRate.toFixed(2)}`);
  console.log(`  Total Roster Value: $${enrichedRoster.summary.totalDutyValue.toFixed(2)}`);
  
  if (enrichedRoster.summary.periodStart && enrichedRoster.summary.periodEnd) {
    const start = enrichedRoster.summary.periodStart;
    const end = enrichedRoster.summary.periodEnd;
    console.log(`  Period: ${start.day}/${start.month + 1}/${start.year} - ${end.day}/${end.month + 1}/${end.year}`);
  }
}

console.log(`\n${'='.repeat(80)}`);
console.log(`Total Value: $${enrichedRoster.summary.totalDutyValue.toFixed(2)}`);
console.log(`${'='.repeat(80)}\n`);

// Show usage information
if (process.argv.length <= 2) {
  console.log('Usage:');
  console.log('  node examples/calculate-roster-value.js [roster-file] [pay-rate]');
  console.log('  Example: node examples/calculate-roster-value.js examples/roster-174423-bp-3715.txt 175.50');
}
